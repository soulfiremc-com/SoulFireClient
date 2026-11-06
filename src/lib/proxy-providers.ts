import { Effect } from "effect";
import { z } from "zod";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import { parseNormalProxy, parseURIProxy } from "@/lib/proxy-format.ts";
import { getProxyKey } from "@/lib/proxy-selection.ts";
import {
  ProviderApiError,
  providerJsonEffect,
  providerTextEffect,
  runProviderEffect,
  type ProviderFetch,
} from "@/lib/provider-request.ts";
import type { ProxyProviderId } from "@/lib/resource-providers.ts";
import type { ProfileProxy } from "@/lib/types.ts";

export type ProviderConnection = {
  apiKey: string;
  username: string;
  password: string;
  resourceId: string;
  sign: string;
  product: string;
  mode: string;
  limit: number;
  country: string;
  protocol: ProxyProto_Type.HTTP | ProxyProto_Type.SOCKS5;
};

export type ConnectionField =
  | "apiKey"
  | "username"
  | "password"
  | "resourceId"
  | "sign"
  | "limit"
  | "country";
export const CONNECTION_FIELDS: Record<ProxyProviderId, ConnectionField[]> = {
  webshare: ["apiKey", "limit"],
  "proxy-seller": ["apiKey"],
  proxyscrape: ["apiKey", "resourceId", "limit"],
  iproyal: ["apiKey", "resourceId"],
  decodo: ["username", "password", "limit", "country"],
  oxylabs: ["username", "password", "resourceId"],
  thordata: ["apiKey", "sign"],
};

export const MAX_PROVIDER_PROXIES = 10_000;
const port = z.coerce.number().int().min(1).max(65535);
const host = z
  .string()
  .min(1)
  .refine((value) => !/[\s/@?#]/.test(value));
const optionalCredential = z.string().nullish();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProviderApiError("response");
  return result.data;
}

function proxy(
  ip: string,
  proxyPort: number,
  protocol: ProviderConnection["protocol"],
  username?: string | null,
  password?: string | null,
): ProfileProxy {
  const address = parse(host, ip);
  const formatted =
    address.includes(":") && !address.startsWith("[")
      ? `[${address}]`
      : address;
  return {
    type: protocol,
    address: `inet://${formatted}:${parse(port, proxyPort)}`,
    username: username || undefined,
    password: password ?? undefined,
  };
}

function required(value: string): string {
  if (!value.trim()) throw new ProviderApiError("authentication");
  return value.trim();
}

function resource(value: string): string {
  if (!/^[\w-]+$/.test(value)) throw new ProviderApiError("response");
  return value;
}

function sellerBase(key: string): string {
  return `https://proxy-seller.com/personal/api/v2/${resource(required(key))}`;
}

const sellerResponse = z.object({ status: z.string(), data: z.unknown() });
function sellerData(value: unknown): unknown {
  const result = parse(sellerResponse, value);
  if (result.status !== "success") throw new ProviderApiError("rejected");
  return result.data;
}

function textProxies(text: string): ProfileProxy[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const result = parseURIProxy(line);
        if (!result) throw new Error("Unsupported protocol");
        return result;
      } catch {
        throw new ProviderApiError("response");
      }
    });
}

export function newProviderProxies(
  proxies: ProfileProxy[],
  existing: ProfileProxy[] = [],
): ProfileProxy[] {
  const seen = new Set(existing.map(getProxyKey));
  return proxies.filter((entry) => {
    const key = getProxyKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function loadProviderProxies(
  id: ProxyProviderId,
  values: ProviderConnection,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<ProfileProxy[]> {
  return runProviderEffect(
    Effect.gen(function* () {
      if (
        !Number.isInteger(values.limit) ||
        values.limit < 1 ||
        values.limit > MAX_PROVIDER_PROXIES
      )
        throw new ProviderApiError("limit");
      if (
        values.protocol !== ProxyProto_Type.HTTP &&
        values.protocol !== ProxyProto_Type.SOCKS5
      )
        throw new ProviderApiError("response");
      const json = (
        url: string,
        headers: Record<string, string>,
        method: "GET" | "POST" = "GET",
      ) => providerJsonEffect({ url, headers, method });
      let proxies: ProfileProxy[];
      switch (id) {
        case "webshare": {
          if (values.mode !== "direct" && values.mode !== "backbone")
            throw new ProviderApiError("response");
          const results: ProfileProxy[] = [];
          const visited = new Set<string>();
          let next: string | null =
            `https://proxy.webshare.io/api/v2/proxy/list/?mode=${values.mode}&page=1&page_size=${Math.min(100, values.limit)}`;
          while (next && results.length < values.limit) {
            const target = new URL(next);
            if (
              target.origin !== "https://proxy.webshare.io" ||
              target.pathname !== "/api/v2/proxy/list/" ||
              target.username ||
              target.password ||
              visited.has(target.href)
            )
              throw new ProviderApiError("response");
            visited.add(target.href);
            const page = parse(
              z.object({
                next: z.string().nullable(),
                results: z.array(
                  z.object({
                    proxy_address: host.nullable(),
                    port,
                    username: z.string(),
                    password: z.string(),
                    valid: z.boolean(),
                  }),
                ),
              }),
              yield* json(target.href, {
                Authorization: `Token ${required(values.apiKey)}`,
              }),
            );
            // A capped page count also bounds empty or invalid-result pagination.
            if (visited.size > 100) throw new ProviderApiError("limit");
            results.push(
              ...page.results
                .filter((entry) => entry.valid && entry.proxy_address !== null)
                .map((entry) =>
                  proxy(
                    entry.proxy_address!,
                    entry.port,
                    values.protocol,
                    entry.username,
                    entry.password,
                  ),
                ),
            );
            next = page.next;
          }
          proxies = results.slice(0, values.limit);
          break;
        }
        case "proxy-seller": {
          if (!["ipv4", "ipv6", "isp"].includes(values.product))
            throw new ProviderApiError("response");
          const filter = values.resourceId
            ? `?orderId=${encodeURIComponent(values.resourceId)}`
            : "";
          const data = parse(
            z.object({
              items: z.array(
                z.object({
                  ip: host,
                  port_socks: port,
                  port_http: port,
                  login: optionalCredential,
                  password: optionalCredential,
                }),
              ),
            }),
            sellerData(
              yield* json(
                `${sellerBase(values.apiKey)}/proxy/list/${values.product}${filter}`,
                {},
              ),
            ),
          );
          proxies = data.items.map((entry) =>
            proxy(
              entry.ip,
              values.protocol === ProxyProto_Type.SOCKS5
                ? entry.port_socks
                : entry.port_http,
              values.protocol,
              entry.login,
              entry.password,
            ),
          );
          break;
        }
        case "proxyscrape": {
          if (
            !["datacenter_shared", "datacenter_dedicated"].includes(
              values.product,
            )
          )
            throw new ProviderApiError("response");
          const query = new URLSearchParams({
            protocol:
              values.protocol === ProxyProto_Type.SOCKS5 ? "socks" : "http",
            format: "credentials",
            credential_format: "3",
            type: "displayproxies",
            limit: String(values.limit),
          });
          proxies = textProxies(
            yield* providerTextEffect({
              url: `https://api.proxyscrape.com/v4/account/${resource(values.resourceId)}/${values.product}/proxy-list?${query}`,
              method: "GET",
              headers: { "api-token": required(values.apiKey) },
            }),
          );
          break;
        }
        case "iproyal": {
          if (!/^\d+$/.test(values.resourceId))
            throw new ProviderApiError("response");
          const data = parse(
            z.object({
              proxy_data: z.object({
                ports: z.object({ socks5: port, "http|https": port }),
                proxies: z.array(
                  z.union([
                    z.string(),
                    z.object({
                      ip: host,
                      username: z.string(),
                      password: z.string(),
                    }),
                  ]),
                ),
              }),
            }),
            yield* json(
              `https://apid.iproyal.com/v1/reseller/orders/${values.resourceId}`,
              { "X-Access-Token": required(values.apiKey) },
            ),
          );
          const proxyPort =
            values.protocol === ProxyProto_Type.SOCKS5
              ? data.proxy_data.ports.socks5
              : data.proxy_data.ports["http|https"];
          proxies = data.proxy_data.proxies.map((entry) => {
            if (typeof entry !== "string")
              return proxy(
                entry.ip,
                proxyPort,
                values.protocol,
                entry.username,
                entry.password,
              );
            try {
              const parsed = parseNormalProxy(entry, values.protocol);
              const ip = parsed.address.slice(7).replace(/:\d+$/, "");
              return proxy(
                ip,
                proxyPort,
                values.protocol,
                parsed.username,
                parsed.password,
              );
            } catch {
              throw new ProviderApiError("response");
            }
          });
          break;
        }
        case "decodo": {
          // This documented generator returns HTTP endpoints only.
          if (values.protocol !== ProxyProto_Type.HTTP)
            throw new ProviderApiError("response");
          if (values.country && !/^[a-z]{2}$/i.test(values.country))
            throw new ProviderApiError("response");
          const query = new URLSearchParams({
            username: required(values.username),
            password: values.password,
            count: String(values.limit),
            session_type: "sticky",
            session_time: "60",
            output_format: "protocol:auth@endpoint",
            response_format: "json",
            protocol: "http",
          });
          if (values.country)
            query.set("country", values.country.toLowerCase());
          const result = yield* json(
            `https://api.decodo.com/v2/endpoints-custom/back-connect?${query}`,
            {},
          );
          const lines = parse(
            z.array(z.string()),
            typeof result === "string" ? parseJsonString(result) : result,
          );
          proxies = textProxies(lines.join("\n"));
          break;
        }
        case "oxylabs": {
          if (values.protocol !== ProxyProto_Type.HTTP)
            throw new ProviderApiError("response");
          const bytes = new TextEncoder().encode(
            `${required(values.username)}:${values.password}`,
          );
          const auth = btoa(
            Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
          );
          const data = parse(
            z.array(z.object({ ip: host, port })),
            yield* json(
              `https://api.oxylabs.io/v1/proxies/lists/${resource(values.resourceId)}`,
              { Authorization: `Basic ${auth}` },
            ),
          );
          proxies = data.map((entry) =>
            proxy(
              entry.ip,
              entry.port,
              values.protocol,
              values.username,
              values.password,
            ),
          );
          break;
        }
        case "thordata": {
          const result = yield* json(
            "https://api.thordata.com/api/gateway/queryListIsp",
            { sign: required(values.sign), apiKey: required(values.apiKey) },
            "POST",
          );
          const envelope = parse(
            z.object({ code: z.number(), data: z.unknown() }),
            result,
          );
          if (envelope.code !== 200) throw new ProviderApiError("rejected");
          const data = parse(
            z.array(
              z.object({ ip: host, port, user: z.string(), pwd: z.string() }),
            ),
            envelope.data,
          );
          proxies = data.map((entry) =>
            proxy(entry.ip, entry.port, values.protocol, entry.user, entry.pwd),
          );
          break;
        }
      }
      if (proxies.length > MAX_PROVIDER_PROXIES)
        throw new ProviderApiError("limit");
      if (!proxies.length) throw new ProviderApiError("empty");
      return newProviderProxies(proxies);
    }).pipe(providerParsing),
    signal,
    fetcher,
  );
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ProviderApiError("response");
  }
}

export type SellerOrder = {
  product: "ipv4" | "ipv6" | "isp";
  country: string;
  period: string;
  quantity: number;
  coupon: string;
};
export type SellerQuote = { total: number; balance: number; currency: string };

function sellerOrderBody(order: SellerOrder) {
  if (
    !["ipv4", "ipv6", "isp"].includes(order.product) ||
    !/^[A-Z]{3}$/.test(order.country) ||
    !/^[\w-]+$/.test(order.period) ||
    !Number.isInteger(order.quantity) ||
    order.quantity < 1 ||
    order.quantity > MAX_PROVIDER_PROXIES
  )
    throw new ProviderApiError("response");
  return {
    sectionCode: order.product,
    countryId: order.country,
    periodId: order.period,
    quantity: order.quantity,
    coupon: order.coupon,
    paymentId: "balance",
    generateAuth: "N",
    customTargetName: "Minecraft",
  };
}

// The pure proxy decoders also serve synchronous consumers. Their domain
// errors become typed failures when they are used inside an Effect workflow.
const providerParsing = Effect.catchDefect((error) =>
  error instanceof ProviderApiError ? Effect.fail(error) : Effect.die(error),
);

function sellerQuoteEffect(key: string, order: SellerOrder) {
  return Effect.gen(function* () {
    const result = yield* providerJsonEffect({
      url: `${sellerBase(key)}/order/calc`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sellerOrderBody(order)),
    });
    return parse(
      z.object({
        total: z.number().nonnegative().finite(),
        balance: z.number().nonnegative().finite(),
        currency: z.string().min(1),
      }),
      sellerData(result),
    );
  }).pipe(providerParsing);
}

export function quoteSellerOrder(
  key: string,
  order: SellerOrder,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<SellerQuote> {
  return runProviderEffect(sellerQuoteEffect(key, order), signal, fetcher);
}

export function purchaseSellerOrder(
  key: string,
  order: SellerOrder,
  quote: SellerQuote,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<string> {
  return runProviderEffect(
    Effect.gen(function* () {
      const current = yield* sellerQuoteEffect(key, order);
      if (
        current.total !== quote.total ||
        current.currency !== quote.currency ||
        current.balance < current.total
      )
        return yield* Effect.fail(new ProviderApiError("priceChanged"));
      const result = yield* providerJsonEffect({
        url: `${sellerBase(key)}/order/make`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sellerOrderBody(order)),
      });
      return parse(
        z.object({
          orderId: z.union([z.string(), z.number()]).transform(String),
        }),
        sellerData(result),
      ).orderId;
    }).pipe(providerParsing),
    signal,
    fetcher,
  );
}

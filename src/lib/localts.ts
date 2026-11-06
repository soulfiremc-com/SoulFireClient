import { Effect } from "effect";
import { z } from "zod";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  ProviderApiError,
  providerJsonEffect,
  runProviderEffect,
  type ProviderFetch,
} from "@/lib/provider-request.ts";

// Contract: https://localts.store/api-docs (authenticated documentation).
const base = "https://localts.store/v1";
const productSchema = z.object({
  id: z.string().regex(/^[\w-]+$/),
  name: z.string(),
  category: z.string(),
  priceInCredits: z.number().nonnegative().finite(),
  stock: z.number().int().nonnegative(),
  type: z.string(),
  quantityDiscounts: z
    .record(z.string().regex(/^[1-9]\d*$/), z.number().min(0).max(100))
    .optional(),
});
export type LocaltsProduct = z.infer<typeof productSchema>;
const localtsOrderSchema = z.object({
  "order-id": z.string(),
  status: z.enum(["PENDING", "PACKAGING", "PACKAGED"]),
  "order-status": z.enum([
    "PENDING",
    "PROCESSING",
    "COMPLETE",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
  ]),
  items: z.array(z.object({ id: z.string(), content: z.string() })).optional(),
});
export type LocaltsOrder = z.infer<typeof localtsOrderSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  return Effect.try({
    try: () => schema.parse(value),
    catch: () => new ProviderApiError("response"),
  });
}

function request(path: string, key: string, method: "GET" | "POST") {
  return Effect.gen(function* () {
    const response = yield* providerJsonEffect({
      url: `${base}${path}`,
      method,
      headers: key ? { "X-API-Key": key.trim() } : undefined,
    });
    const result = yield* parse(z.object({ success: z.boolean() }), response);
    if (!result.success)
      return yield* Effect.fail(new ProviderApiError("rejected"));
    return response;
  });
}

const productsEffect = () =>
  Effect.gen(function* () {
    return (yield* parse(
      z.object({ products: z.array(productSchema) }),
      yield* request("/products", "", "GET"),
    )).products;
  });
const balanceEffect = (key: string) =>
  Effect.gen(function* () {
    if (!key.trim())
      return yield* Effect.fail(new ProviderApiError("authentication"));
    return (yield* parse(
      z.object({ balance: z.number().nonnegative().finite() }),
      yield* request("/me", key, "GET"),
    )).balance;
  });

export function fetchLocaltsProducts(
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<LocaltsProduct[]> {
  return runProviderEffect(productsEffect(), signal, fetcher);
}

export function fetchLocaltsBalance(
  key: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<number> {
  return runProviderEffect(balanceEffect(key), signal, fetcher);
}

export function localtsPrice(product: LocaltsProduct, amount: number): number {
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000)
    throw new ProviderApiError("limit");
  const tier = Object.entries(product.quantityDiscounts ?? {})
    .filter(([quantity]) => Number(quantity) <= amount)
    .sort(([a], [b]) => Number(b) - Number(a))[0];
  return Number(
    (product.priceInCredits * amount * (1 - (tier?.[1] ?? 0) / 100)).toFixed(8),
  );
}

export function purchaseLocaltsAccounts(
  key: string,
  product: LocaltsProduct,
  amount: number,
  expectedTotal: number,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<string> {
  return runProviderEffect(
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => localtsPrice(product, amount),
        catch: () => new ProviderApiError("limit"),
      });
      const [products, balance] = yield* Effect.all(
        [productsEffect(), balanceEffect(key)],
        { concurrency: "unbounded" },
      );
      const current = products.find((entry) => entry.id === product.id);
      if (!current || current.stock < amount)
        return yield* Effect.fail(new ProviderApiError("empty"));
      if (
        localtsPrice(current, amount) !== expectedTotal ||
        balance < expectedTotal
      )
        return yield* Effect.fail(new ProviderApiError("priceChanged"));
      const result = yield* request(
        `/products/${current.id}/purchase?amount=${amount}`,
        key,
        "POST",
      );
      return (yield* parse(z.object({ orderId: z.string().min(1) }), result))
        .orderId;
    }),
    signal,
    fetcher,
  );
}

export function fetchLocaltsOrder(
  key: string,
  id: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<LocaltsOrder> {
  return runProviderEffect(
    Effect.gen(function* () {
      const order = yield* parse(
        localtsOrderSchema,
        yield* request(
          `/orders/get-order?${new URLSearchParams({ id })}`,
          key,
          "GET",
        ),
      );
      if (order["order-id"] !== id)
        return yield* Effect.fail(new ProviderApiError("response"));
      return order;
    }),
    signal,
    fetcher,
  );
}

export function fetchLocaltsOrders(
  key: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<{ id: string; productId: string }[]> {
  return runProviderEffect(
    Effect.gen(function* () {
      return (yield* parse(
        z.object({
          orders: z.array(z.object({ id: z.string(), productId: z.string() })),
        }),
        yield* request("/orders?page=0&size=25", key, "GET"),
      )).orders;
    }),
    signal,
    fetcher,
  );
}

export type LocaltsImportFormat =
  | "cookies"
  | "credentials"
  | "refresh-token"
  | "access-token";

export function localtsOrderAccounts(
  order: LocaltsOrder,
  format: LocaltsImportFormat,
): { payload: string[]; credentialType: AccountTypeCredentials } {
  if (
    order.status !== "PACKAGED" ||
    !["COMPLETE", "PARTIALLY_REFUNDED"].includes(order["order-status"]) ||
    !order.items?.length
  )
    throw new ProviderApiError("empty");
  const credentialType = {
    cookies: AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
    credentials: AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS,
    "refresh-token": AccountTypeCredentials.MICROSOFT_JAVA_REFRESH_TOKEN,
    "access-token": AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
  }[format];
  const payload = order.items.map((item) => {
    const content = item.content.trim();
    if (!content) throw new ProviderApiError("response");
    if (format !== "cookies") return content;
    if (
      content.startsWith("[") ||
      content.includes("\t") ||
      content.includes("__Host-MSAAUTHP=")
    )
      return content;
    // Localts delivers the Microsoft cookie value rather than a cookie file.
    if (/[\s;]/.test(content)) throw new ProviderApiError("response");
    return JSON.stringify([
      { domain: "login.live.com", name: "__Host-MSAAUTHP", value: content },
    ]);
  });
  return { payload, credentialType };
}

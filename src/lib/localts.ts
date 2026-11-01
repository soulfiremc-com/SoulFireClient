import { z } from "zod";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  ProviderApiError,
  providerJson,
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

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProviderApiError("response");
  return result.data;
}

async function request(
  path: string,
  key: string,
  method: "GET" | "POST",
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<unknown> {
  const response = await providerJson(
    {
      url: `${base}${path}`,
      method,
      headers: key ? { "X-API-Key": key.trim() } : undefined,
    },
    signal,
    fetcher,
  );
  const result = parse(z.object({ success: z.boolean() }), response);
  if (!result.success) throw new ProviderApiError("rejected");
  return response;
}

export async function fetchLocaltsProducts(
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<LocaltsProduct[]> {
  return parse(
    z.object({ products: z.array(productSchema) }),
    await request("/products", "", "GET", signal, fetcher),
  ).products;
}

export async function fetchLocaltsBalance(
  key: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<number> {
  if (!key.trim()) throw new ProviderApiError("authentication");
  return parse(
    z.object({ balance: z.number().nonnegative().finite() }),
    await request("/me", key, "GET", signal, fetcher),
  ).balance;
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

export async function purchaseLocaltsAccounts(
  key: string,
  product: LocaltsProduct,
  amount: number,
  expectedTotal: number,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<string> {
  localtsPrice(product, amount);
  const [products, balance] = await Promise.all([
    fetchLocaltsProducts(signal, fetcher),
    fetchLocaltsBalance(key, signal, fetcher),
  ]);
  const current = products.find((entry) => entry.id === product.id);
  if (!current || current.stock < amount) throw new ProviderApiError("empty");
  if (
    localtsPrice(current, amount) !== expectedTotal ||
    balance < expectedTotal
  )
    throw new ProviderApiError("priceChanged");
  const result = await request(
    `/products/${current.id}/purchase?amount=${amount}`,
    key,
    "POST",
    signal,
    fetcher,
  );
  return parse(z.object({ orderId: z.string().min(1) }), result).orderId;
}

export async function fetchLocaltsOrder(
  key: string,
  id: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<LocaltsOrder> {
  const order = parse(
    localtsOrderSchema,
    await request(
      `/orders/get-order?${new URLSearchParams({ id })}`,
      key,
      "GET",
      signal,
      fetcher,
    ),
  );
  if (order["order-id"] !== id) throw new ProviderApiError("response");
  return order;
}

export async function fetchLocaltsOrders(
  key: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<{ id: string; productId: string }[]> {
  return parse(
    z.object({
      orders: z.array(z.object({ id: z.string(), productId: z.string() })),
    }),
    await request("/orders?page=0&size=25", key, "GET", signal, fetcher),
  ).orders;
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

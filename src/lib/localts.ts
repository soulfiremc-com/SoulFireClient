import { Effect, Schema } from "effect";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  ProviderApiError,
  providerJsonEffect,
  runProviderEffect,
  type ProviderFetch,
} from "@/lib/provider-request.ts";

// Contract: https://localts.store/api-docs (authenticated documentation).
const base = "https://localts.store/v1";
const productSchema = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[\w-]+$/)),
  name: Schema.String,
  category: Schema.String,
  priceInCredits: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).check(
    Schema.isFinite(),
  ),
  stock: Schema.Finite.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  type: Schema.String,
  quantityDiscounts: Schema.optional(
    Schema.Record(
      Schema.String.check(Schema.isPattern(/^[1-9]\d*$/)),
      Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).check(
        Schema.isLessThanOrEqualTo(100),
      ),
    ),
  ),
});
export type LocaltsProduct = (typeof productSchema)["Type"];
const localtsOrderSchema = Schema.Struct({
  "order-id": Schema.String,
  status: Schema.Literals(["PENDING", "PACKAGING", "PACKAGED"]),
  "order-status": Schema.Literals([
    "PENDING",
    "PROCESSING",
    "COMPLETE",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
  ]),
  items: Schema.optional(
    Schema.mutable(
      Schema.Array(
        Schema.Struct({ id: Schema.String, content: Schema.String }),
      ),
    ),
  ),
});
export type LocaltsOrder = (typeof localtsOrderSchema)["Type"];

function parse<T>(schema: Schema.ConstraintDecoder<T>, value: unknown) {
  return Schema.decodeUnknownEffect(schema, { errors: "all" })(value).pipe(
    Effect.mapError(() => new ProviderApiError("response")),
  );
}

function request(path: string, key: string, method: "GET" | "POST") {
  return Effect.gen(function* () {
    const response = yield* providerJsonEffect({
      url: `${base}${path}`,
      method,
      headers: key ? { "X-API-Key": key.trim() } : undefined,
    });
    const result = yield* parse(
      Schema.Struct({ success: Schema.Boolean }),
      response,
    );
    if (!result.success)
      return yield* Effect.fail(new ProviderApiError("rejected"));
    return response;
  });
}

const productsEffect = () =>
  Effect.gen(function* () {
    return (yield* parse(
      Schema.Struct({ products: Schema.mutable(Schema.Array(productSchema)) }),
      yield* request("/products", "", "GET"),
    )).products;
  });
const balanceEffect = (key: string) =>
  Effect.gen(function* () {
    if (!key.trim())
      return yield* Effect.fail(new ProviderApiError("authentication"));
    return (yield* parse(
      Schema.Struct({
        balance: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).check(
          Schema.isFinite(),
        ),
      }),
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
      return (yield* parse(
        Schema.Struct({ orderId: Schema.String.check(Schema.isMinLength(1)) }),
        result,
      )).orderId;
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
        Schema.Struct({
          orders: Schema.mutable(
            Schema.Array(
              Schema.Struct({ id: Schema.String, productId: Schema.String }),
            ),
          ),
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

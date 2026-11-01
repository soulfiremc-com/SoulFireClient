import { z } from "zod";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  ProviderApiError,
  providerJson,
  type ProviderFetch,
} from "@/lib/provider-request.ts";

// Contract: https://fernan.club/api (authenticated documentation).
const base = "https://api.fernan.club/api/v1";
const stockSchema = z.object({
  product_id: z.number().int().positive(),
  product_name: z.string(),
  category: z.string(),
  count: z.number().int().nonnegative(),
  price: z.number().nonnegative().finite(),
  purchase_limit: z.number().int().nonnegative(),
});
const cooldownSchema = z.object({
  product_id: z.number().int().positive(),
  remaining_allowed: z.number().int().nonnegative(),
  on_cooldown: z.boolean(),
});
const itemSchema = z.object({
  data: z.string(),
  access_token: z.string().nullish(),
});
const purchaseSchema = z.object({
  purchase_id: z.string().uuid(),
  products: z.array(itemSchema),
  total_cost: z.number().nonnegative().optional(),
  balance_after: z.number().nonnegative().optional(),
});
export type FernanProduct = z.infer<typeof stockSchema>;
export type FernanCooldown = z.infer<typeof cooldownSchema>;
export type FernanPurchase = z.infer<typeof purchaseSchema>;
export type FernanImportFormat = "access-token" | "cookies" | "credentials";
export type FernanAccount = {
  balance: number;
  stock: FernanProduct[];
  cooldowns: FernanCooldown[];
  purchases: { purchase_id: string; product_name: string }[];
};

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ProviderApiError("response");
  return result.data;
}

async function request(
  path: string,
  key: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (!key.trim()) throw new ProviderApiError("authentication");
  const result = parse(
    z.object({ success: z.boolean(), data: z.unknown() }),
    await providerJson(
      {
        url: `${base}${path}`,
        method: body ? "POST" : "GET",
        headers: {
          "X-API-Key": key.trim(),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      signal,
      fetcher,
    ),
  );
  if (!result.success) throw new ProviderApiError("rejected");
  return result.data;
}

export async function fetchFernanAccount(
  key: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<FernanAccount> {
  const [user, stock, cooldowns, history] = await Promise.all([
    request("/user/me", key, signal, fetcher),
    request("/store/stock", key, signal, fetcher),
    request("/store/cooldown", key, signal, fetcher),
    request("/store/purchases?limit=20&offset=0", key, signal, fetcher),
  ]);
  return {
    balance: parse(
      z.object({ balance: z.number().nonnegative().finite() }),
      user,
    ).balance,
    stock: parse(z.object({ stock: z.array(stockSchema) }), stock).stock,
    cooldowns: parse(
      z.object({ cooldowns: z.array(cooldownSchema) }),
      cooldowns,
    ).cooldowns,
    purchases: parse(
      z.object({
        purchases: z.array(
          z.object({
            purchase_id: z.string().uuid(),
            product_name: z.string(),
          }),
        ),
      }),
      history,
    ).purchases,
  };
}

export function fernanPurchaseLimit(
  product: FernanProduct,
  cooldowns: FernanCooldown[],
): number {
  const cooldown = cooldowns.find(
    (entry) => entry.product_id === product.product_id,
  );
  if (!cooldown || cooldown.on_cooldown) return 0;
  return Math.min(
    100,
    product.count,
    product.purchase_limit,
    cooldown.remaining_allowed,
  );
}

export async function purchaseFernanAccounts(
  key: string,
  product: FernanProduct,
  amount: number,
  maximumCost: number,
  referral: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<FernanPurchase> {
  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 100 ||
    (referral && !/^[a-z\d]{3,16}$/i.test(referral))
  )
    throw new ProviderApiError("response");
  const current = await fetchFernanAccount(key, signal, fetcher);
  const updated = current.stock.find(
    (entry) => entry.product_id === product.product_id,
  );
  if (!updated || amount > fernanPurchaseLimit(updated, current.cooldowns))
    throw new ProviderApiError("empty");
  if (updated.price * amount !== maximumCost || current.balance < maximumCost)
    throw new ProviderApiError("priceChanged");
  return parse(
    purchaseSchema,
    await request("/store/purchase", key, signal, fetcher, {
      product_id: product.product_id,
      amount,
      ...(referral ? { referral_code: referral } : {}),
    }),
  );
}

export async function fetchFernanPurchase(
  key: string,
  id: string,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<FernanPurchase> {
  const parsedId = parse(z.string().uuid(), id);
  const purchase = parse(
    z.object({ purchase: purchaseSchema }),
    await request(`/store/purchases/${parsedId}`, key, signal, fetcher),
  ).purchase;
  if (purchase.purchase_id !== parsedId) throw new ProviderApiError("response");
  return purchase;
}

export function fernanPurchaseAccounts(
  purchase: FernanPurchase,
  format: FernanImportFormat,
): { payload: string[]; credentialType: AccountTypeCredentials } {
  if (!purchase.products.length) throw new ProviderApiError("empty");
  const credentialType = {
    "access-token": AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
    cookies: AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
    credentials: AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS,
  }[format];
  const payload = purchase.products.map((item) => {
    if (format === "access-token") {
      if (!item.access_token?.trim()) throw new ProviderApiError("response");
      return item.access_token;
    }
    try {
      const value = new TextDecoder("utf-8", { fatal: true })
        .decode(
          Uint8Array.from(atob(item.data), (character) =>
            character.charCodeAt(0),
          ),
        )
        .trim();
      if (!value) throw new Error("Empty delivery");
      return value;
    } catch {
      throw new ProviderApiError("response");
    }
  });
  return { payload, credentialType };
}

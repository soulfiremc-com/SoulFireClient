import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  fetchFernanPurchase,
  fernanPurchaseAccounts,
  fernanPurchaseLimit,
  purchaseFernanAccounts,
  type FernanProduct,
  type FernanPurchase,
} from "./fernan.ts";
import {
  validateProviderRequest,
  type ProviderRequest,
} from "./provider-request-policy.ts";
import type { ProviderFetch } from "./provider-request.ts";

const id = "550e8400-e29b-41d4-a716-446655440000";
const product: FernanProduct = {
  product_id: 1,
  product_name: "Cookie accounts",
  category: "cookie",
  count: 100,
  price: 100,
  purchase_limit: 5,
};
const delivered: FernanPurchase = {
  purchase_id: id,
  products: [
    {
      data: btoa(
        "login.live.com\tFALSE\t/\tTRUE\t0\t__Host-MSAAUTHP\tcookie-value",
      ),
      access_token: "test-access-token",
    },
  ],
  total_cost: 190,
  balance_after: 810,
};

function mock(
  change: {
    price?: number;
    remaining?: number;
    cooling?: boolean;
    balance?: number;
    error?: boolean;
  } = {},
) {
  const requests: ProviderRequest[] = [];
  const fetcher: ProviderFetch = async (request) => {
    validateProviderRequest(request);
    requests.push(request);
    const path = new URL(request.url).pathname;
    let data: unknown;
    if (path.endsWith("/user/me")) data = { balance: change.balance ?? 1_000 };
    else if (path.endsWith("/store/stock"))
      data = { stock: [{ ...product, price: change.price ?? 100 }] };
    else if (path.endsWith("/store/cooldown"))
      data = {
        cooldowns: [
          {
            product_id: 1,
            remaining_allowed: change.remaining ?? 5,
            on_cooldown: change.cooling ?? false,
          },
        ],
      };
    else if (path.endsWith("/store/purchases"))
      data = {
        purchases: [{ purchase_id: id, product_name: "Cookie accounts" }],
      };
    else if (path.endsWith("/store/purchase")) {
      if (change.error)
        return {
          status: 409,
          body: JSON.stringify({
            success: false,
            data: { error: "Purchase conflict" },
          }),
        };
      data = delivered;
    } else data = { purchase: delivered };
    return { status: 200, body: JSON.stringify({ success: true, data }) };
  };
  return { requests, fetcher };
}

test("Fernan purchase requests include the documented SOULFIRE referral code", async () => {
  const { fetcher, requests } = mock();
  const result = await purchaseFernanAccounts(
    "private-key",
    product,
    2,
    200,
    "SOULFIRE",
    undefined,
    fetcher,
  );
  assert.equal(result.purchase_id, id);
  assert.equal(result.products.length, 1);
  assert.equal(result.balance_after, 810);
  const purchases = requests.filter((request) => request.method === "POST");
  assert.equal(purchases.length, 1);
  assert.equal(
    purchases[0].url,
    "https://api.fernan.club/api/v1/store/purchase",
  );
  assert.deepEqual(JSON.parse(purchases[0].body!), {
    product_id: 1,
    amount: 2,
    referral_code: "SOULFIRE",
  });
  assert.equal(purchases[0].headers?.["X-API-Key"], "private-key");
});

test("Fernan omits a removed referral code", async () => {
  const { fetcher, requests } = mock();
  await purchaseFernanAccounts("key", product, 1, 100, "", undefined, fetcher);
  assert.deepEqual(JSON.parse(requests[requests.length - 1].body!), {
    product_id: 1,
    amount: 1,
  });
});

test("Fernan enforces stock, cooldown, purchase and endpoint limits", () => {
  assert.equal(
    fernanPurchaseLimit(product, [
      { product_id: 1, remaining_allowed: 3, on_cooldown: false },
    ]),
    3,
  );
  assert.equal(
    fernanPurchaseLimit({ ...product, count: 1 }, [
      { product_id: 1, remaining_allowed: 3, on_cooldown: false },
    ]),
    1,
  );
  assert.equal(
    fernanPurchaseLimit(product, [
      { product_id: 1, remaining_allowed: 5, on_cooldown: true },
    ]),
    0,
  );
  assert.equal(fernanPurchaseLimit(product, []), 0);
});

test("Fernan blocks invalid or stale purchases before the paid request", async () => {
  for (const change of [
    { price: 101 },
    { remaining: 0 },
    { cooling: true },
    { balance: 1 },
  ]) {
    const { fetcher, requests } = mock(change);
    await assert.rejects(
      purchaseFernanAccounts(
        "key",
        product,
        2,
        200,
        "SOULFIRE",
        undefined,
        fetcher,
      ),
    );
    assert.equal(
      requests.some((request) => request.method === "POST"),
      false,
    );
  }
  for (const amount of [0, 1.5, 101]) {
    const { fetcher, requests } = mock();
    await assert.rejects(
      purchaseFernanAccounts(
        "key",
        product,
        amount,
        200,
        "SOULFIRE",
        undefined,
        fetcher,
      ),
    );
    assert.equal(requests.length, 0);
  }
});

test("Fernan never retries a rejected paid request", async () => {
  const { fetcher, requests } = mock({ error: true });
  await assert.rejects(
    purchaseFernanAccounts(
      "key",
      product,
      1,
      100,
      "SOULFIRE",
      undefined,
      fetcher,
    ),
    { reason: "rejected" },
  );
  assert.equal(
    requests.filter((request) => request.method === "POST").length,
    1,
  );
});

test("Fernan imports delivered access tokens and decodes cookie files", () => {
  assert.deepEqual(fernanPurchaseAccounts(delivered, "access-token"), {
    payload: ["test-access-token"],
    credentialType: AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
  });
  const cookies = fernanPurchaseAccounts(delivered, "cookies");
  assert.equal(
    cookies.credentialType,
    AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
  );
  assert.equal(
    cookies.payload[0],
    "login.live.com\tFALSE\t/\tTRUE\t0\t__Host-MSAAUTHP\tcookie-value",
  );
  assert.throws(() =>
    fernanPurchaseAccounts({ ...delivered, products: [] }, "cookies"),
  );
  assert.throws(() =>
    fernanPurchaseAccounts(
      { ...delivered, products: [{ data: "!invalid!" }] },
      "cookies",
    ),
  );
});

test("Fernan can recover an existing purchase without placing another order", async () => {
  const { fetcher, requests } = mock();
  const purchase = await fetchFernanPurchase("key", id, undefined, fetcher);
  assert.equal(purchase.products[0].access_token, "test-access-token");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
});

test("the desktop bridge cannot retrieve or regenerate Fernan API keys", () => {
  for (const [path, method] of [
    ["user/key", "GET"],
    ["user/key/regenerate", "POST"],
  ] as const)
    assert.throws(() =>
      validateProviderRequest({
        url: `https://api.fernan.club/api/v1/${path}`,
        method,
      }),
    );
});

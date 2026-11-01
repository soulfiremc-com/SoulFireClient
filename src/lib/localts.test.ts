import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  fetchLocaltsBalance,
  fetchLocaltsOrder,
  localtsOrderAccounts,
  localtsPrice,
  purchaseLocaltsAccounts,
  type LocaltsOrder,
  type LocaltsProduct,
} from "./localts.ts";
import type { ProviderFetch } from "./provider-request.ts";
import {
  validateProviderRequest,
  type ProviderRequest,
} from "./provider-request-policy.ts";

const product: LocaltsProduct = {
  id: "cookie-alts",
  name: "Cookie accounts",
  category: "Minecraft",
  priceInCredits: 10,
  stock: 100,
  type: "Text",
  quantityDiscounts: { "5": 10, "10": 20 },
};
const packaged: LocaltsOrder = {
  "order-id": "order-123",
  status: "PACKAGED",
  "order-status": "COMPLETE",
  items: [{ id: "item-1", content: "cookie-value" }],
};

function mock(
  overrides: {
    price?: number;
    balance?: number;
    stock?: number;
    order?: unknown;
    purchase?: unknown;
  } = {},
) {
  const requests: ProviderRequest[] = [];
  const fetcher: ProviderFetch = async (request) => {
    validateProviderRequest(request);
    requests.push(request);
    const url = new URL(request.url);
    let data: unknown;
    if (url.pathname === "/v1/products")
      data = {
        success: true,
        products: [
          {
            ...product,
            priceInCredits: overrides.price ?? product.priceInCredits,
            stock: overrides.stock ?? product.stock,
          },
        ],
      };
    else if (url.pathname === "/v1/me")
      data = {
        success: true,
        username: "customer",
        balance: overrides.balance ?? 1_000,
      };
    else if (url.pathname === "/v1/orders/get-order")
      data = overrides.order ?? { success: true, ...packaged };
    else data = overrides.purchase ?? { success: true, orderId: "order-123" };
    return { status: 200, body: JSON.stringify(data) };
  };
  return { requests, fetcher };
}

test("Localts pricing applies the highest eligible quantity tier", () => {
  assert.equal(localtsPrice(product, 1), 10);
  assert.equal(localtsPrice(product, 4), 40);
  assert.equal(localtsPrice(product, 5), 45);
  assert.equal(localtsPrice(product, 10), 80);
  for (const invalid of [0, -1, 1.5, 1_001, NaN])
    assert.throws(() => localtsPrice(product, invalid));
});

test("Localts verifies stock, balance and price before one credit-funded purchase", async () => {
  const { fetcher, requests } = mock();
  assert.equal(
    await purchaseLocaltsAccounts(
      "private-key",
      product,
      5,
      45,
      undefined,
      fetcher,
    ),
    "order-123",
  );
  const purchases = requests.filter((request) => request.method === "POST");
  assert.equal(purchases.length, 1);
  assert.equal(
    purchases[0].url,
    "https://localts.store/v1/products/cookie-alts/purchase?amount=5",
  );
  assert.equal(purchases[0].headers?.["X-API-Key"], "private-key");
  assert.equal(purchases[0].body, undefined);
  assert.equal(new URL(purchases[0].url).searchParams.has("affiliate"), false);
  assert.equal(new URL(purchases[0].url).searchParams.has("campaign"), false);
});

test("Localts will not buy after a price change, insufficient balance or stock loss", async () => {
  for (const change of [{ price: 11 }, { balance: 1 }, { stock: 0 }]) {
    const { fetcher, requests } = mock(change);
    await assert.rejects(
      purchaseLocaltsAccounts("key", product, 1, 10, undefined, fetcher),
    );
    assert.equal(
      requests.some((request) => request.method === "POST"),
      false,
    );
  }
});

test("Localts business errors cannot masquerade as successful orders", async () => {
  const { fetcher } = mock({
    purchase: { success: false, error: "secret account details" },
  });
  await assert.rejects(
    purchaseLocaltsAccounts("key", product, 1, 10, undefined, fetcher),
    { message: "Provider request failed: rejected" },
  );
});

test("Localts order IDs are encoded and verified before importing", async () => {
  const { fetcher, requests } = mock();
  const result = await fetchLocaltsOrder(
    "key",
    "order-123",
    undefined,
    fetcher,
  );
  assert.equal(result["order-id"], "order-123");
  assert.equal(new URL(requests[0].url).searchParams.get("id"), "order-123");
  await assert.rejects(
    fetchLocaltsOrder("key", "other&amount=999", undefined, fetcher),
    { reason: "response" },
  );
});

test("Localts cookie tokens become cookie JSON accepted by the account importer", () => {
  const result = localtsOrderAccounts(packaged, "cookies");
  assert.equal(
    result.credentialType,
    AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
  );
  assert.deepEqual(JSON.parse(result.payload[0]), [
    {
      domain: "login.live.com",
      name: "__Host-MSAAUTHP",
      value: "cookie-value",
    },
  ]);
  const exportedCookies =
    '[{"domain":"login.live.com","name":"__Host-MSAAUTHP","value":"cookie"}]';
  assert.equal(
    localtsOrderAccounts(
      { ...packaged, items: [{ id: "1", content: exportedCookies }] },
      "cookies",
    ).payload[0],
    exportedCookies,
  );
});

test("Localts preserves account credential content and delivered items on partial refunds", () => {
  const order = {
    ...packaged,
    "order-status": "PARTIALLY_REFUNDED" as const,
    items: [{ id: "1", content: "user@example.com:password:otp" }],
  };
  const result = localtsOrderAccounts(order, "credentials");
  assert.equal(
    result.credentialType,
    AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS,
  );
  assert.deepEqual(result.payload, ["user@example.com:password:otp"]);
});

test("Localts does not import pending, packaging or fully refunded orders", () => {
  for (const order of [
    { ...packaged, status: "PENDING" as const },
    { ...packaged, status: "PACKAGING" as const },
    { ...packaged, "order-status": "PENDING" as const },
    { ...packaged, "order-status": "PROCESSING" as const },
    { ...packaged, "order-status": "REFUNDED" as const },
    { ...packaged, items: [] },
  ])
    assert.throws(() => localtsOrderAccounts(order, "cookies"));
});

test("Localts empty keys do not trigger authenticated balance requests", async () => {
  const { fetcher, requests } = mock();
  await assert.rejects(fetchLocaltsBalance(" ", undefined, fetcher), {
    reason: "authentication",
  });
  assert.equal(requests.length, 0);
});

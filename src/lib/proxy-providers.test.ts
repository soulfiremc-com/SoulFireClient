import assert from "node:assert/strict";
import { test } from "node:test";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import {
  ProviderApiError,
  providerJson,
  type ProviderFetch,
} from "./provider-request.ts";
import {
  loadProviderProxies,
  newProviderProxies,
  purchaseSellerOrder,
  quoteSellerOrder,
  type ProviderConnection,
  type SellerOrder,
} from "./proxy-providers.ts";
import {
  validateProviderRequest,
  type ProviderRequest,
} from "./provider-request-policy.ts";

const values: ProviderConnection = {
  apiKey: "secret-key",
  username: "proxy-user",
  password: "private:password@",
  resourceId: "order-123",
  sign: "account-sign",
  product: "ipv4",
  mode: "direct",
  limit: 100,
  country: "",
  protocol: ProxyProto_Type.SOCKS5,
};

function mock(responses: unknown[]) {
  const requests: ProviderRequest[] = [];
  const fetcher: ProviderFetch = async (request) => {
    validateProviderRequest(request);
    requests.push(request);
    assert.ok(responses.length, "Unexpected provider request");
    const response = responses.shift();
    return {
      status: 200,
      body: typeof response === "string" ? response : JSON.stringify(response),
    };
  };
  return { fetcher, requests };
}

const webProxy = {
  proxy_address: "192.0.2.1",
  port: 1080,
  username: "account",
  password: "part:two@three",
  valid: true,
};

test("Webshare imports authenticated pages and preserves complete credentials", async () => {
  const { fetcher, requests } = mock([
    {
      results: [webProxy, { ...webProxy, valid: false }],
      next: "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=2",
    },
    {
      results: [webProxy, { ...webProxy, proxy_address: "2001:db8::1" }],
      next: null,
    },
  ]);
  const result = await loadProviderProxies(
    "webshare",
    values,
    undefined,
    fetcher,
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[1].headers?.Authorization, "Token secret-key");
  assert.deepEqual(
    result.map((entry) => entry.address),
    ["inet://192.0.2.1:1080", "inet://[2001:db8::1]:1080"],
  );
  assert.equal(result[0].password, "part:two@three");
});

test("Webshare stops at the selected limit and does not leak its key to pagination URLs", async () => {
  const limited = mock([
    {
      results: [webProxy, { ...webProxy, proxy_address: "192.0.2.2" }],
      next: "https://evil.test/",
    },
  ]);
  assert.equal(
    (
      await loadProviderProxies(
        "webshare",
        { ...values, limit: 1 },
        undefined,
        limited.fetcher,
      )
    ).length,
    1,
  );
  assert.equal(limited.requests.length, 1);
  for (const next of [
    "https://evil.test/",
    "https://proxy.webshare.io/api/v2/register/",
    "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100",
  ]) {
    const unsafe = mock([{ results: [], next }]);
    await assert.rejects(
      loadProviderProxies("webshare", values, undefined, unsafe.fetcher),
      { reason: "response" },
    );
    assert.equal(unsafe.requests.length, 1);
  }
});

test("Proxy-Seller uses the selected protocol's port and filters purchased orders", async () => {
  for (const [protocol, expectedPort] of [
    [ProxyProto_Type.HTTP, 8080],
    [ProxyProto_Type.SOCKS5, 1080],
  ] as const) {
    const { fetcher, requests } = mock([
      {
        status: "success",
        data: {
          items: [
            {
              ip: "2001:db8::1",
              port_socks: 1080,
              port_http: 8080,
              login: "proxy-user",
              password: "secret:@",
            },
          ],
        },
      },
    ]);
    const [entry] = await loadProviderProxies(
      "proxy-seller",
      { ...values, protocol },
      undefined,
      fetcher,
    );
    assert.equal(entry.address, `inet://[2001:db8::1]:${expectedPort}`);
    assert.equal(entry.password, "secret:@");
    assert.equal(
      new URL(requests[0].url).searchParams.get("orderId"),
      "order-123",
    );
  }
});

test("ProxyScrape requests credential exports with SOCKS-specific ports", async () => {
  const { fetcher, requests } = mock([
    "socks5://user:password@192.0.2.1:1080\nsocks5://user:password@192.0.2.2:1080\n",
  ]);
  const result = await loadProviderProxies(
    "proxyscrape",
    { ...values, product: "datacenter_shared" },
    undefined,
    fetcher,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].type, ProxyProto_Type.SOCKS5);
  assert.equal(new URL(requests[0].url).searchParams.get("protocol"), "socks");
  assert.equal(
    new URL(requests[0].url).searchParams.get("format"),
    "credentials",
  );
  assert.equal(requests[0].headers?.["api-token"], "secret-key");
});

test("IPRoyal imports an order using the shared protocol port", async () => {
  const { fetcher } = mock([
    {
      proxy_data: {
        ports: { socks5: 12324, "http|https": 12323 },
        proxies: [
          { ip: "192.0.2.1", username: "user", password: "secret" },
          "192.0.2.2:12323:user:secret:@",
        ],
      },
    },
  ]);
  const result = await loadProviderProxies(
    "iproyal",
    { ...values, resourceId: "420" },
    undefined,
    fetcher,
  );
  assert.deepEqual(
    result.map((entry) => entry.address),
    ["inet://192.0.2.1:12324", "inet://192.0.2.2:12324"],
  );
  assert.equal(result[1].password, "secret:@");
});

test("Decodo handles its JSON-encoded array response and does not pretend HTTP endpoints are SOCKS5", async () => {
  const { fetcher, requests } = mock([
    JSON.stringify(
      JSON.stringify(["http://user-session-1:password@gate.decodo.com:10000"]),
    ),
  ]);
  const result = await loadProviderProxies(
    "decodo",
    { ...values, protocol: ProxyProto_Type.HTTP, country: "DE" },
    undefined,
    fetcher,
  );
  assert.equal(result[0].type, ProxyProto_Type.HTTP);
  assert.equal(result[0].address, "inet://gate.decodo.com:10000");
  assert.equal(new URL(requests[0].url).searchParams.get("country"), "de");
  await assert.rejects(
    loadProviderProxies("decodo", values, undefined, fetcher),
    { reason: "response" },
  );
});

test("Oxylabs retrieves an enterprise list with proxy credentials", async () => {
  const { fetcher, requests } = mock([[{ ip: "192.0.2.1", port: "60000" }]]);
  const [entry] = await loadProviderProxies(
    "oxylabs",
    { ...values, protocol: ProxyProto_Type.HTTP },
    undefined,
    fetcher,
  );
  assert.equal(
    requests[0].headers?.Authorization,
    `Basic ${btoa("proxy-user:private:password@")}`,
  );
  assert.equal(entry.password, values.password);
  assert.equal(entry.address, "inet://192.0.2.1:60000");
});

test("Thordata imports ISP credentials and rejects business-level errors", async () => {
  const success = mock([
    {
      code: 200,
      data: [
        { ip: "192.0.2.1", port: 6666, user: "isp-user", pwd: "isp-password" },
      ],
    },
  ]);
  assert.equal(
    (
      await loadProviderProxies("thordata", values, undefined, success.fetcher)
    )[0].username,
    "isp-user",
  );
  assert.equal(success.requests[0].method, "POST");
  assert.equal(success.requests[0].headers?.sign, "account-sign");
  const failure = mock([{ code: 500, msg: "secret vendor details", data: [] }]);
  await assert.rejects(
    loadProviderProxies("thordata", values, undefined, failure.fetcher),
    { reason: "rejected" },
  );
});

test("provider imports reject malformed endpoints, invalid limits and empty results", async () => {
  for (const limit of [0, 1.5, 10_001, NaN]) {
    const { fetcher, requests } = mock([]);
    await assert.rejects(
      loadProviderProxies("webshare", { ...values, limit }, undefined, fetcher),
      { reason: "limit" },
    );
    assert.equal(requests.length, 0);
  }
  const malformed = mock([{ results: [{ ...webProxy, port: 0 }], next: null }]);
  await assert.rejects(
    loadProviderProxies("webshare", values, undefined, malformed.fetcher),
    { reason: "response" },
  );
  const empty = mock([{ results: [], next: null }]);
  await assert.rejects(
    loadProviderProxies("webshare", values, undefined, empty.fetcher),
    { reason: "empty" },
  );
});

test("repeated imports skip existing entries while retaining different credentials", () => {
  const first = {
    type: ProxyProto_Type.SOCKS5,
    address: "inet://192.0.2.1:1080",
    username: "user",
    password: "first",
  };
  const second = { ...first, password: "second" };
  assert.deepEqual(newProviderProxies([first, first, second], [first]), [
    second,
  ]);
});

const order: SellerOrder = {
  product: "ipv4",
  country: "USA",
  period: "1m",
  quantity: 5,
  coupon: "SOULFIREMC",
};
const quote = { total: 9, balance: 20, currency: "USD" };
const sellerQuoteResponse = { status: "success", data: quote };

test("Proxy-Seller quotes and purchases with the affiliate coupon using balance only", async () => {
  const { fetcher, requests } = mock([
    sellerQuoteResponse,
    sellerQuoteResponse,
    { status: "success", data: { orderId: "order-456" } },
  ]);
  const displayed = await quoteSellerOrder(
    values.apiKey,
    order,
    undefined,
    fetcher,
  );
  const id = await purchaseSellerOrder(
    values.apiKey,
    order,
    displayed,
    undefined,
    fetcher,
  );
  assert.equal(id, "order-456");
  assert.equal(requests.length, 3);
  for (const request of requests) {
    const body = JSON.parse(request.body!);
    assert.equal(body.coupon, "SOULFIREMC");
    assert.equal(body.paymentId, "balance");
    assert.equal(body.quantity, 5);
    assert.equal(body.sectionCode, "ipv4");
    assert.equal(body.periodId, "1m");
  }
  assert.ok(requests[2].url.endsWith("/order/make"));
});

test("a removed coupon stays removed and price checks never place an order", async () => {
  const { fetcher, requests } = mock([sellerQuoteResponse]);
  await quoteSellerOrder(
    values.apiKey,
    { ...order, coupon: "" },
    undefined,
    fetcher,
  );
  assert.equal(JSON.parse(requests[0].body!).coupon, "");
  assert.ok(requests.every((request) => request.url.endsWith("/order/calc")));
});

test("price or currency changes and insufficient balance prevent a purchase", async () => {
  for (const changed of [
    { ...quote, total: 10 },
    { ...quote, currency: "EUR" },
    { ...quote, balance: 1 },
  ]) {
    const { fetcher, requests } = mock([{ status: "success", data: changed }]);
    await assert.rejects(
      purchaseSellerOrder(values.apiKey, order, quote, undefined, fetcher),
      { reason: "priceChanged" },
    );
    assert.equal(requests.length, 1);
    assert.ok(requests[0].url.endsWith("/order/calc"));
  }
});

test("invalid quantities and provider business failures cannot place orders", async () => {
  for (const quantity of [0, 0.5, 10_001]) {
    const { fetcher, requests } = mock([]);
    await assert.rejects(
      quoteSellerOrder(
        values.apiKey,
        { ...order, quantity },
        undefined,
        fetcher,
      ),
    );
    assert.equal(requests.length, 0);
  }
  const failure = mock([
    { status: "error", data: null, errors: [{ message: "key=secret" }] },
  ]);
  await assert.rejects(
    quoteSellerOrder(values.apiKey, order, undefined, failure.fetcher),
    { message: "Provider request failed: rejected" },
  );
});

test("HTTP and JSON errors do not expose provider secrets", async () => {
  for (const status of [401, 403, 429, 500]) {
    const fetcher: ProviderFetch = async () => ({ status, body: "secret-key" });
    await assert.rejects(
      providerJson(
        { url: "https://proxy.webshare.io/api/v2/proxy/list/", method: "GET" },
        undefined,
        fetcher,
      ),
      (cause: unknown) =>
        cause instanceof ProviderApiError &&
        cause.reason ===
          (status >= 500
            ? "response"
            : status === 429
              ? "rejected"
              : "authentication") &&
        !cause.message.includes("secret-key"),
    );
  }
});

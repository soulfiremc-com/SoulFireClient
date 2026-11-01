import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executeProviderRequest,
  type ProviderRequest,
  validateProviderRequest,
} from "./provider-request-policy.ts";

const request: ProviderRequest = {
  url: "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct",
  method: "GET",
  headers: { Authorization: "Token private-key" },
};

test("provider requests reject arbitrary destinations, redirects and unexpected capabilities", () => {
  for (const url of [
    "http://proxy.webshare.io/api/v2/proxy/list/",
    "https://proxy.webshare.io.evil.test/api/v2/proxy/list/",
    "https://proxy.webshare.io:8443/api/v2/proxy/list/",
    "https://user:secret@proxy.webshare.io/api/v2/proxy/list/",
    "https://proxy.webshare.io/api/v2/proxy/list/#secret",
    "https://proxy.webshare.io/api/v2/register/",
    "https://127.0.0.1/admin",
    "file:///etc/passwd",
  ])
    assert.throws(() => validateProviderRequest({ ...request, url }));
  assert.throws(() => validateProviderRequest({ ...request, method: "POST" }));
  assert.throws(() =>
    validateProviderRequest({ ...request, body: "unexpected" }),
  );
  assert.throws(() =>
    validateProviderRequest({
      ...request,
      headers: { Cookie: "session=secret" },
    }),
  );
  assert.throws(() =>
    validateProviderRequest({
      ...request,
      headers: { Authorization: "Token key\r\nHost: evil.test" },
    }),
  );
});

test("provider requests allow only documented purchase endpoints", () => {
  for (const path of ["calc", "make"])
    validateProviderRequest({
      url: `https://proxy-seller.com/personal/api/v2/key/order/${path}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"paymentId":"balance"}',
    });
  assert.throws(() =>
    validateProviderRequest({
      url: "https://proxy-seller.com/personal/api/v2/key/proxy/replace",
      method: "POST",
    }),
  );
});

test("HTTP requests omit ambient credentials and disallow redirects", async () => {
  let received: RequestInit | undefined;
  const fetcher: typeof fetch = async (_url, options) => {
    received = options;
    return new Response('{"results":[]}', { status: 200 });
  };
  assert.deepEqual(await executeProviderRequest(request, fetcher), {
    status: 200,
    body: '{"results":[]}',
  });
  assert.equal(received?.credentials, "omit");
  assert.equal(received?.redirect, "error");
  assert.equal(received?.referrerPolicy, "no-referrer");
  assert.equal(
    (received?.headers as Record<string, string> | undefined)?.Authorization,
    "Token private-key",
  );
});

test("network errors do not expose credential-bearing URLs", async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error("Request https://provider.test/?password=secret failed");
  };
  await assert.rejects(executeProviderRequest(request, fetcher), {
    message: "Provider connection failed",
  });
});

test("requests do not reach the network for invalid endpoints", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response();
  };
  await assert.rejects(
    executeProviderRequest({ ...request, url: "https://evil.test" }, fetcher),
  );
  assert.equal(calls, 0);
});

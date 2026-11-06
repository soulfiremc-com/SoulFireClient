import assert from "node:assert/strict";
import { test } from "node:test";
import { Clock, Effect, Exit, Fiber, Scope } from "effect";
import { TestClock } from "effect/testing";
import {
  executeProviderRequest,
  executeProviderRequestEffect,
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

test("provider deadlines abort the HTTP request and hide transport details", async () => {
  const scope = Scope.makeUnsafe();
  const clock = await Effect.runPromise(
    TestClock.make().pipe(Effect.provideService(Scope.Scope, scope)),
  );
  let requestSignal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fetcher: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      requestSignal = options!.signal!;
      requestSignal.addEventListener(
        "abort",
        () => reject(new Error("secret URL and token")),
        { once: true },
      );
      started();
    });
  const fiber = Effect.runFork(
    executeProviderRequestEffect(request, fetcher).pipe(
      Effect.provideService(Clock.Clock, clock),
    ),
  );
  try {
    await ready;
    await Effect.runPromise(clock.adjust("30 seconds"));
    await assert.rejects(Effect.runPromise(Fiber.join(fiber)), {
      message: "Provider connection failed",
    });
    assert.equal(requestSignal?.aborted, true);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test("caller cancellation aborts a provider HTTP request", async () => {
  const controller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fetcher: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      requestSignal = options!.signal!;
      requestSignal.addEventListener(
        "abort",
        () => reject(new Error("private credentials")),
        { once: true },
      );
      started();
    });
  const pending = executeProviderRequest(request, fetcher, controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(pending, { message: "Provider connection failed" });
  assert.equal(requestSignal?.aborted, true);
});

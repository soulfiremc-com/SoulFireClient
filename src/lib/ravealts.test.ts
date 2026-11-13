import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchKeyInfo,
  purchaseAccounts,
  RavealtsApiError,
} from "./ravealts.ts";

test("Ravealts preserves purchases without adding unsupported affiliate fields", async () => {
  const original = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, options) => {
    requests.push(options!);
    return Response.json({
      status: "success",
      accounts: [{ raw: "account-token" }],
    });
  };
  try {
    const result = await purchaseAccounts("api-key", "hypixel_unbanned", 2);
    assert.equal(result.accounts.length, 1);
    assert.deepEqual(JSON.parse(requests[0].body as string), {
      user_request: { account_type: "hypixel_unbanned", amount: 2 },
    });
    assert.equal(
      (requests[0].headers as Record<string, string>).Authorization,
      "Bearer api-key",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Ravealts retains rate-limit errors returned with HTTP 429", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      {
        status: "error",
        error_type: "rate_limited",
        message: "Try again later",
      },
      { status: 429 },
    );
  try {
    await assert.rejects(
      fetchKeyInfo("api-key"),
      (cause: unknown) =>
        cause instanceof RavealtsApiError && cause.errorType === "rate_limited",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Ravealts rejects invalid purchase quantities before calling its API", async () => {
  for (const amount of [0, 1.5, 11, NaN])
    await assert.rejects(
      purchaseAccounts("api-key", "hypixel_unbanned", amount),
    );
});

test("Ravealts server failures leave the purchase outcome uncertain", async () => {
  const original = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    return Response.json(
      {
        status: "error",
        error_type: "server_error",
        message: "private details",
      },
      { status: 502 },
    );
  };
  try {
    await assert.rejects(purchaseAccounts("api-key", "hypixel_unbanned", 1), {
      reason: "response",
      message: "Provider request failed: response",
    });
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = original;
  }
});

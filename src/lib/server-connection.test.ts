import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { ClientService } from "@/generated/soulfire/client_pb";
import {
  normalizeServerAddress,
  verifyServerConnection,
} from "./server-connection";

test("connection URLs preserve server path prefixes and reject non-HTTP URLs", () => {
  assert.equal(
    normalizeServerAddress(" https://example.com/soulfire/?ignored=1#login "),
    "https://example.com/soulfire",
  );
  for (const address of [
    "ftp://example.com",
    "ws://example.com",
    "https://user:secret@example.com",
    "invalid",
  ]) {
    assert.throws(() => normalizeServerAddress(address));
  }
});

test("preflight returns an address only after the server accepts the request", async () => {
  let calls = 0;
  const transport = createRouterTransport(({ service }) => {
    service(ClientService, {
      getClientData: () => {
        calls++;
        return {};
      },
    });
  });
  assert.equal(
    await verifyServerConnection(
      "http://localhost:38765/",
      "token",
      undefined,
      transport,
    ),
    "http://localhost:38765",
  );
  assert.equal(calls, 1);
});

test("preflight preserves rejected credentials and aborted requests as failures", async () => {
  const transport = createRouterTransport(({ service }) => {
    service(ClientService, {
      getClientData: () => {
        throw new ConnectError("Expired", Code.Unauthenticated);
      },
    });
  });
  await assert.rejects(
    verifyServerConnection("http://localhost", "expired", undefined, transport),
    (error: unknown) =>
      error instanceof ConnectError && error.code === Code.Unauthenticated,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    verifyServerConnection(
      "http://localhost",
      "token",
      controller.signal,
      transport,
    ),
  );
});

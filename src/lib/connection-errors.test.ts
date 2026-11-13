import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  getConnectionErrorKind,
  getConnectionRetryDelay,
} from "./connection-errors";

test("only transient RPC failures retry, with backoff and a limit", () => {
  for (const error of [
    new ConnectError("Server stopped", Code.Unavailable),
    new ConnectError("Timed out", Code.DeadlineExceeded),
    ConnectError.from(new TypeError("Failed to fetch")),
  ]) {
    assert.equal(getConnectionErrorKind(error), "connection");
    assert.deepEqual(
      [0, 1, 2, 3, 4].map((attempt) => getConnectionRetryDelay(error, attempt)),
      [5000, 10000, 20000, null, null],
    );
  }
  for (const error of [
    new Error("Render failed"),
    new TypeError("Invalid value"),
    new ConnectError("Invalid settings", Code.InvalidArgument),
    new ConnectError("Bot disconnected", Code.FailedPrecondition),
    new ConnectError("Request cancelled", Code.Canceled),
  ]) {
    assert.equal(getConnectionRetryDelay(error, 0), null);
  }
});

test("authentication and permission failures have distinct recovery actions", () => {
  assert.equal(
    getConnectionErrorKind(new ConnectError("Expired", Code.Unauthenticated)),
    "authentication",
  );
  assert.equal(
    getConnectionErrorKind(
      new ConnectError("Forbidden", Code.PermissionDenied),
    ),
    "permission",
  );
  assert.equal(
    getConnectionRetryDelay(
      new ConnectError("Expired", Code.Unauthenticated),
      0,
    ),
    null,
  );
});

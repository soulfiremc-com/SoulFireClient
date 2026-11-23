import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  getConnectionErrorKind,
  getConnectionRetryDelay,
  getLoginErrorMessage,
  getRejectedCodeMessage,
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
      [1000, 2000, 4000, null, null],
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

test("sign-in messages name the rate limit and do not blame a missing token", () => {
  const limited = new ConnectError(
    "Too many login attempts",
    Code.ResourceExhausted,
  );
  assert.equal(getLoginErrorMessage(limited, "email"), "rateLimited");
  assert.equal(getLoginErrorMessage(limited, "token"), "rateLimited");
  const internal = new ConnectError("Mail failed", Code.Internal);
  assert.equal(getLoginErrorMessage(internal, "email"), "emailUnexpected");
  assert.equal(getLoginErrorMessage(internal, "token"), "unexpected");
  const offline = ConnectError.from(new TypeError("Failed to fetch"));
  assert.equal(getLoginErrorMessage(offline, "email"), "connection");
  const expired = new ConnectError("Expired", Code.Unauthenticated);
  assert.equal(getLoginErrorMessage(expired, "token"), "authentication");
});

test("a rejected email code counts as expired after 15 minutes", () => {
  const sentAt = 1_000_000;
  assert.equal(getRejectedCodeMessage(sentAt, sentAt + 60_000), "invalid");
  assert.equal(
    getRejectedCodeMessage(sentAt, sentAt + 15 * 60_000 - 1),
    "invalid",
  );
  assert.equal(getRejectedCodeMessage(sentAt, sentAt + 15 * 60_000), "expired");
});

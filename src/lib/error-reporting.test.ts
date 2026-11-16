import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { CancelledError } from "@tanstack/react-query";
import type { CaptureResult } from "posthog-js";
import { filterExpectedExceptions, isExpectedError } from "./error-reporting";

function exceptionEvent(...entries: { type: string; value: string }[]) {
  return {
    uuid: "event",
    event: "$exception",
    properties: { $exception_list: entries },
  } as CaptureResult;
}

test("cancellations, connection loss, and rejected sessions are expected", () => {
  for (const error of [
    new CancelledError(),
    new DOMException("Aborted", "AbortError"),
    ConnectError.from(new TypeError("Failed to fetch")),
    new ConnectError("signal is aborted without reason", Code.Canceled),
    new ConnectError("Server stopped", Code.Unavailable),
    new ConnectError("User not found or invalid token", Code.Unauthenticated),
    new ConnectError("Bot 'a' is not online", Code.FailedPrecondition),
    new ConnectError("Missing", Code.NotFound),
  ]) {
    assert.equal(isExpectedError(error), true, String(error));
  }
});

test("defects and server faults are still reported", () => {
  for (const error of [
    new Error("Render failed"),
    new TypeError("Cannot read properties of undefined"),
    new ConnectError("level is null", Code.Internal),
    new ConnectError("Invalid settings", Code.InvalidArgument),
    new ConnectError("Something broke", Code.Unknown),
  ]) {
    assert.equal(isExpectedError(error), false, String(error));
  }
});

test("before_send drops events that only contain expected errors", () => {
  for (const event of [
    exceptionEvent({
      type: "ConnectError",
      value: "[unknown] Failed to fetch",
    }),
    exceptionEvent(
      { type: "ConnectError", value: "[unknown] Failed to fetch" },
      { type: "TypeError", value: "Failed to fetch" },
    ),
    exceptionEvent({ type: "Error", value: "CancelledError" }),
    exceptionEvent({
      type: "ConnectError",
      value: "[canceled] signal is aborted without reason",
    }),
    exceptionEvent({
      type: "ConnectError",
      value: "[failed_precondition] Bot 'a' is not online",
    }),
    exceptionEvent({
      type: "ConnectError",
      value: "[unauthenticated] User not found or invalid token",
    }),
    exceptionEvent({
      type: "Error",
      value: "ResizeObserver loop completed with undelivered notifications.",
    }),
  ]) {
    assert.equal(filterExpectedExceptions(event), null);
  }
});

test("before_send keeps real exceptions and other events", () => {
  for (const event of [
    exceptionEvent({ type: "Error", value: "Render failed" }),
    exceptionEvent({ type: "ConnectError", value: "[internal] level is null" }),
    exceptionEvent({ type: "ConnectError", value: "[unknown] Unexpected" }),
    exceptionEvent(
      { type: "ConnectError", value: "[unknown] Failed to fetch" },
      { type: "TypeError", value: "x is undefined" },
    ),
    { uuid: "page", event: "$pageview", properties: {} } as CaptureResult,
  ]) {
    assert.equal(filterExpectedExceptions(event), event);
  }
});

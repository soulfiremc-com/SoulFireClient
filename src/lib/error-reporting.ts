import { Code, ConnectError } from "@connectrpc/connect";
import { CancelledError } from "@tanstack/react-query";
import type { CaptureResult } from "posthog-js";
import { getConnectionErrorKind } from "@/lib/connection-errors";

// Codes that describe server or session state, not a client defect.
const EXPECTED_CONNECT_CODES = new Set([
  Code.Canceled,
  Code.Unavailable,
  Code.DeadlineExceeded,
  Code.Unauthenticated,
  Code.PermissionDenied,
  Code.NotFound,
  Code.FailedPrecondition,
]);

// Browsers word a failed fetch differently. Connect reports all of them as "[unknown]".
const NETWORK_FAILURE_MESSAGES = [
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
  "network error",
];

const EXPECTED_CONNECT_MESSAGE =
  /^\[(canceled|unavailable|deadline_exceeded|unauthenticated|permission_denied|not_found|failed_precondition)\]/u;

function isNetworkFailureMessage(message: string) {
  return NETWORK_FAILURE_MESSAGES.some((text) => message.includes(text));
}

/**
 * Errors that come from cancelled work, an unreachable server, or a rejected
 * session. The UI handles them, so they are not reported as exceptions.
 */
export function isExpectedError(error: unknown): boolean {
  if (error instanceof CancelledError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof ConnectError) {
    return (
      EXPECTED_CONNECT_CODES.has(error.code) ||
      getConnectionErrorKind(error) === "connection"
    );
  }
  return false;
}

interface ExceptionEntry {
  type?: unknown;
  value?: unknown;
}

function isExpectedExceptionEntry({ type, value }: ExceptionEntry) {
  if (typeof value !== "string") return false;
  if (value === "CancelledError") return true;
  // Browsers report this when observers resize layout in the same frame. It is
  // harmless and mostly comes from React Flow measuring nodes.
  if (value.startsWith("ResizeObserver loop")) return true;
  if (type === "AbortError") return true;
  // The fetch failure that a ConnectError wraps can appear as its cause.
  if (type === "TypeError") return isNetworkFailureMessage(value);
  if (type !== "ConnectError") return false;
  return (
    EXPECTED_CONNECT_MESSAGE.test(value) ||
    (value.startsWith("[unknown]") && isNetworkFailureMessage(value))
  );
}

/**
 * PostHog `before_send` hook. It drops exception events that only contain
 * expected errors, including unhandled rejections that PostHog captures on its own.
 */
export function filterExpectedExceptions(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event?.event !== "$exception") return event;
  const list: unknown = event.properties["$exception_list"];
  if (
    Array.isArray(list) &&
    list.length > 0 &&
    list.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- PostHog passes exception list entries as any; isExpectedExceptionEntry checks the fields it reads
        isExpectedExceptionEntry(entry as ExceptionEntry),
    )
  ) {
    return null;
  }
  return event;
}

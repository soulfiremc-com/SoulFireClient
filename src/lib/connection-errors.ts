import { Code, ConnectError } from "@connectrpc/connect";

export function getConnectionErrorKind(error: unknown) {
  if (error instanceof ConnectError) {
    if (error.code === Code.Unauthenticated) return "authentication";
    if (error.code === Code.PermissionDenied) return "permission";
    if (
      error.code === Code.Unavailable ||
      error.code === Code.DeadlineExceeded ||
      (error.code === Code.Unknown && error.cause instanceof TypeError)
    )
      return "connection";
  }
  return "unexpected";
}

/**
 * Retries a lost connection briefly so a short network blip does not show an
 * error. Longer outages go to the error page, which keeps reconnecting and
 * tells the user what is happening.
 */
export function getConnectionRetryDelay(error: unknown, attempts: number) {
  if (getConnectionErrorKind(error) !== "connection" || attempts >= 3) {
    return null;
  }
  return 1000 * 2 ** attempts;
}

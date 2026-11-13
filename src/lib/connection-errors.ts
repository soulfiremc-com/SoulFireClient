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

export function getConnectionRetryDelay(error: unknown, attempts: number) {
  if (getConnectionErrorKind(error) !== "connection" || attempts >= 3) {
    return null;
  }
  return 5_000 * 2 ** attempts;
}

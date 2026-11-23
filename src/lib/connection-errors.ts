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

/**
 * Picks the launcher message for a failed sign-in. The server limits sign-in
 * requests per client, and an email sign-in has no token to blame.
 */
export function getLoginErrorMessage(
  error: unknown,
  method: "email" | "token",
) {
  if (error instanceof ConnectError && error.code === Code.ResourceExhausted)
    return "rateLimited";
  const kind = getConnectionErrorKind(error);
  if (
    method === "email" &&
    (kind === "authentication" || kind === "unexpected")
  )
    return "emailUnexpected";
  return kind;
}

/** The server forgets a sign-in code 15 minutes after sending it. */
const EMAIL_CODE_LIFETIME_MS = 15 * 60 * 1000;

/**
 * The server answers an expired code like a wrong one, so the send time
 * tells them apart.
 */
export function getRejectedCodeMessage(sentAt: number, now: number) {
  return now - sentAt >= EMAIL_CODE_LIFETIME_MS ? "expired" : "invalid";
}

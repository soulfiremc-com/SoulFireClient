import { Code, ConnectError } from "@connectrpc/connect";

export function isResourceUnavailable(error: unknown): error is ConnectError {
  // Deleted instances can return permission denied once their owner record is gone.
  return (
    error instanceof ConnectError &&
    (error.code === Code.NotFound || error.code === Code.PermissionDenied)
  );
}

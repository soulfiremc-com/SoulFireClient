import { Code, ConnectError } from "@connectrpc/connect";

// Older servers fail with a NullPointerException when a bot is connected but
// has not joined a world yet, for example "...minecraft().level" is null.
const MISSING_WORLD_MESSAGE = /"[^"]*\b(level|player)" is null/;

/**
 * Whether a bot RPC failed because the bot is offline or not in a world yet.
 * The bot page shows its offline state for these errors instead of an error page.
 */
export function isBotNotReadyError(error: unknown): error is ConnectError {
  if (!(error instanceof ConnectError)) return false;
  if (error.code === Code.FailedPrecondition) return true;
  return (
    error.code === Code.Internal && MISSING_WORLD_MESSAGE.test(error.rawMessage)
  );
}

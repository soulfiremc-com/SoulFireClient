import { CastState } from "@soulfiremc/cast-protocol";
import { createStore } from "@tanstack/react-store";
import { Effect, Fiber, Option, Schema } from "effect";
import { exists, t } from "i18next";
import { desktop, isDesktopApp } from "@/lib/desktop";

const fromPromise = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (error) => (error instanceof Error ? error.message : String(error)),
  });

// `error` holds a Cast error code or raw message. Pass it through
// castErrorMessage when rendering, so it follows language changes.
export const castStore = createStore<{
  state: CastState | null;
  error: string | null;
}>({ state: null, error: null });
const accept = (input: unknown) => {
  const decoded = Schema.decodeUnknownOption(CastState)(input);
  if (Option.isNone(decoded)) {
    castStore.setState((current) => ({
      ...current,
      error: "invalidState",
    }));
    return;
  }
  const state = decoded.value;
  castStore.setState((current) =>
    !current.state || state.revision >= current.state.revision
      ? { state, error: null }
      : current,
  );
};

/**
 * Translates a Cast error code from the desktop process. Electron prefixes
 * IPC errors, so the code is the last word after a colon. Other text, such as
 * a socket or receiver error, is shown as it is.
 */
export function castErrorMessage(message: string): string {
  const code = /(?:^|:\s)([a-z][A-Za-z]*)$/u.exec(message)?.[1];
  const key = `cast:errors.${code}`;
  return code !== undefined && exists(key) ? t(key) : message;
}

export function startCastClient(): () => void {
  if (!isDesktopApp()) return () => {};
  const fiber = Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          fromPromise(() => desktop.cast.onState(accept)),
          (unsubscribe) => Effect.sync(unsubscribe),
        );
        const state = yield* fromPromise(() => desktop.cast.getState());
        accept(state);
        yield* fromPromise(() => desktop.cast.discover());
        return yield* Effect.never;
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          castStore.setState((state) => ({ ...state, error }));
        }),
      ),
    ),
  );
  return () => {
    void Effect.runPromise(Fiber.interrupt(fiber));
  };
}

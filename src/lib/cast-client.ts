import {
  CastState,
  type CastDevice,
  type CastSource,
  type DisplaySettings,
} from "@soulfiremc/cast-protocol";
import { createStore } from "@tanstack/react-store";
import {
  Context,
  Data,
  Effect,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
} from "effect";
import { desktop, isDesktopApp } from "@/lib/desktop";

class CastDesktopError extends Data.TaggedError("CastDesktopError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const CastDesktop = Context.Service<{
  readonly connect: (
    device: CastDevice,
    source: CastSource,
    relaunch: boolean,
  ) => Effect.Effect<void, CastDesktopError>;
  readonly stop: (id: string) => Effect.Effect<void, CastDesktopError>;
  readonly setSettings: (
    settings: DisplaySettings,
  ) => Effect.Effect<void, CastDesktopError>;
}>("soulfire/CastDesktop");
const fromPromise = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (error) =>
      new CastDesktopError({
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      }),
  });
const runtime = ManagedRuntime.make(
  Layer.succeed(CastDesktop, {
    connect: (device, source, relaunch) =>
      fromPromise(() => desktop.cast.connect(device, source, relaunch)),
    stop: (id) => fromPromise(() => desktop.cast.stop(id)),
    setSettings: (settings) =>
      fromPromise(() => desktop.cast.setSettings(settings)),
  }),
);
export const castStore = createStore<{
  state: CastState | null;
  error: string | null;
}>({ state: null, error: null });
const accept = (input: unknown) => {
  const state = Schema.decodeUnknownSync(CastState)(input);
  castStore.setState((current) =>
    !current.state || state.revision >= current.state.revision
      ? { state, error: null }
      : current,
  );
};

export function startCastClient(): () => void {
  if (!isDesktopApp()) return () => {};
  const fiber = runtime.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          fromPromise(() => desktop.cast.onState(accept)),
          (unsubscribe) => Effect.sync(unsubscribe),
        );
        accept(yield* fromPromise(() => desktop.cast.getState()));
        yield* fromPromise(() => desktop.cast.discover());
        return yield* Effect.never;
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          castStore.setState((state) => ({ ...state, error: error.message }));
        }),
      ),
    ),
  );
  return () => {
    void runtime.runPromise(Fiber.interrupt(fiber));
  };
}

export const castClient = {
  connect: (device: CastDevice, source: CastSource, relaunch = false) =>
    runtime.runPromise(
      Effect.flatMap(CastDesktop, (service) =>
        service.connect(device, source, relaunch),
      ),
    ),
  stop: (id: string) =>
    runtime.runPromise(
      Effect.flatMap(CastDesktop, (service) => service.stop(id)),
    ),
  setSettings: (settings: DisplaySettings) =>
    runtime.runPromise(
      Effect.flatMap(CastDesktop, (service) => service.setSettings(settings)),
    ),
};

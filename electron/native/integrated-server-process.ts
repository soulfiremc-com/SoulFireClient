import type { ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { stripVTControlCharacters } from "node:util";
import { Cause, Deferred, Effect, Exit, Fiber, type Scope } from "effect";
import type {
  DesktopIntegratedServerDiagnostics,
  DesktopIntegratedServerLog,
} from "../../src/lib/desktop-api";

const MAX_LOG_LINES = 2_000;
const MAX_LOG_CHARACTERS = 1_000_000;

export type IntegratedServerState = {
  child: ChildProcessWithoutNullStreams | null;
  processFiber: Fiber.Fiber<void> | null;
  controller: AbortController | null;
  startup: Promise<string | null> | null;
  termination: Promise<void> | null;
  jcmdPath: string | null | undefined;
  jcmdSearch: Promise<void> | null;
  diagnostics: Omit<DesktopIntegratedServerDiagnostics, "jcmdPath">;
  logSequence: number;
  logCharacters: number;
};

export function createIntegratedServerState(): IntegratedServerState {
  return {
    child: null,
    processFiber: null,
    controller: null,
    startup: null,
    termination: null,
    jcmdPath: undefined,
    jcmdSearch: null,
    diagnostics: {
      status: "idle",
      pid: null,
      startedAt: null,
      processStartedAt: null,
      exitedAt: null,
      exitCode: null,
      exitSignal: null,
      error: null,
      javaPath: null,
      jarPath: null,
      dataDirectory: "",
      port: null,
      logs: [],
      droppedLogCount: 0,
    },
    logSequence: 0,
    logCharacters: 0,
  };
}

export function appendIntegratedLog(
  state: IntegratedServerState,
  rawMessage: string,
  source: DesktopIntegratedServerLog["source"] = "launcher",
): string {
  const message = stripVTControlCharacters(rawMessage)
    .trim()
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted token]")
    .replace(/(\bBearer\s+)\S+/gi, "$1[redacted]")
    .slice(0, 16_000);
  if (!message) return message;
  state.diagnostics.logs.push({
    id: ++state.logSequence,
    timestamp: Date.now(),
    source,
    message,
  });
  state.logCharacters += message.length;
  while (
    state.diagnostics.logs.length > MAX_LOG_LINES ||
    state.logCharacters > MAX_LOG_CHARACTERS
  ) {
    const removed = state.diagnostics.logs.shift();
    state.logCharacters -= removed?.message.length ?? 0;
    state.diagnostics.droppedLogCount++;
  }
  return message;
}

// Promise adapters must settle before startup is released. Some preparation
// steps cannot abort midway through writing or extracting files.
function awaitPreparation<A>(promise: Promise<A>): Effect.Effect<A, unknown> {
  return Effect.callback<A, unknown>((resume) => {
    promise.then(
      (value) => resume(Effect.succeed(value)),
      (error) => resume(Effect.fail(error)),
    );
    return Effect.promise(() =>
      promise.then(
        () => {},
        () => {},
      ),
    );
  });
}

export function startIntegratedOperation(
  state: IntegratedServerState,
  operation: (
    signal: AbortSignal,
  ) => Promise<string> | Effect.Effect<string, unknown, Scope.Scope>,
): Promise<string | null> {
  if (state.startup || state.child || state.termination) {
    return Promise.reject(
      new Error(
        "The integrated server is already starting, running, or stopping",
      ),
    );
  }
  const controller = new AbortController();
  state.controller = controller;
  state.diagnostics = {
    ...createIntegratedServerState().diagnostics,
    status: "preparing",
    startedAt: Date.now(),
  };
  state.logCharacters = 0;
  const startup = Effect.scoped(
    Effect.gen(function* () {
      const work = operation(controller.signal);
      const credentials = yield* Effect.isEffect(work)
        ? work
        : awaitPreparation(work);
      controller.signal.throwIfAborted();
      if (
        !state.child ||
        state.child.exitCode !== null ||
        state.child.signalCode !== null
      )
        return yield* Effect.fail(
          new Error("SoulFire exited before startup completed"),
        );
      state.diagnostics.status = "running";
      return credentials;
    }),
  ).pipe(
    Effect.onExit((exit) => {
      if (Exit.isSuccess(exit)) return Effect.void;
      return Effect.gen(function* () {
        if (!controller.signal.aborted) {
          const error = Cause.squash(exit.cause);
          state.diagnostics.error =
            error instanceof Error ? error.message : String(error);
          appendIntegratedLog(state, state.diagnostics.error);
        }
        yield* Effect.promise(() => terminateIntegratedProcess(state));
        state.diagnostics.status = controller.signal.aborted
          ? "stopped"
          : "failed";
        state.diagnostics.exitedAt ??= Date.now();
      });
    }),
  );
  state.startup = Effect.runPromiseExit(startup, { signal: controller.signal })
    .then((exit) => {
      if (controller.signal.aborted) return null;
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
      return exit.value;
    })
    .finally(() => {
      state.controller = null;
      state.startup = null;
    });
  return state.startup;
}

export async function killIntegratedServer(
  state: IntegratedServerState,
): Promise<void> {
  if (!state.startup && !state.child && !state.termination) return;
  state.diagnostics.status = "stopping";
  const monitor = state.processFiber;
  state.controller?.abort(new Error("Integrated server startup cancelled"));
  // Keep startup occupied until preparation finalizers and process shutdown settle.
  await Effect.runPromise(
    Effect.all(
      [
        Effect.promise(() => terminateIntegratedProcess(state)),
        Effect.promise(
          () =>
            state.startup?.then(
              () => {},
              () => {},
            ) ?? Promise.resolve(),
        ),
      ],
      { concurrency: "unbounded" },
    ),
  );
  if (monitor) await Effect.runPromise(Fiber.join(monitor));
  state.diagnostics.status = "stopped";
}

export function terminateIntegratedProcess(
  state: IntegratedServerState,
  gracePeriodMs = 5_000,
): Promise<void> {
  if (state.termination) return state.termination;
  const child = state.child;
  if (!child) return Promise.resolve();

  const closed = Effect.callback<void>((resume) => {
    const finish = () => resume(Effect.void);
    child.once("close", finish);
    return Effect.sync(() => child.removeListener("close", finish));
  });
  const terminate = Effect.gen(function* () {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    yield* Effect.sleep(gracePeriodMs);
    if (child.exitCode === null && child.signalCode === null) {
      appendIntegratedLog(
        state,
        "Java did not stop gracefully. Forcing it to stop.",
      );
      child.kill("SIGKILL");
    }
    yield* Effect.sleep(5_000);
    return yield* Effect.fail(
      new Error(
        "Java did not exit after a forced stop. Check the process in your system monitor.",
      ),
    );
  });
  state.termination = Effect.runPromise(
    Effect.raceFirst(closed, terminate),
  ).finally(() => {
    state.termination = null;
  });
  return state.termination;
}

export function waitForIntegratedServerReady(
  state: IntegratedServerState,
  child: ChildProcessWithoutNullStreams,
  signal: AbortSignal,
): Promise<void> {
  state.child = child;
  state.diagnostics.status = "starting";
  state.diagnostics.pid = child.pid ?? null;
  state.diagnostics.processStartedAt = Date.now();
  const readiness = Deferred.makeUnsafe<void, Error>();
  let ready = false;

  // The monitor outlives startup so crash diagnostics and trailing logs remain
  // available after credentials have been returned to the renderer.
  const closed = Deferred.makeUnsafe<void>();
  const monitor = Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const readers = (["stdout", "stderr"] as const).map((source) => {
            const reader = readline.createInterface({ input: child[source] });
            reader.on("line", (rawLine) => {
              if (state.child !== child) return;
              const line = appendIntegratedLog(state, rawLine, source);
              if (line.includes("Finished loading!")) {
                ready = true;
                Deferred.doneUnsafe(readiness, Effect.void);
              }
            });
            return reader;
          });
          const onError = (error: Error) => {
            if (state.child === child) state.diagnostics.error = error.message;
            Deferred.doneUnsafe(readiness, Effect.fail(error));
          };
          const onExit = (
            code: number | null,
            exitSignal: NodeJS.Signals | null,
          ) => {
            if (state.child !== child) return;
            state.diagnostics.exitedAt = Date.now();
            state.diagnostics.exitCode = code;
            state.diagnostics.exitSignal = exitSignal;
            if (state.diagnostics.status !== "stopping") {
              state.diagnostics.status = "failed";
              state.diagnostics.error ??= `Java exited with ${exitSignal ? `signal ${exitSignal}` : `code ${code}`}${ready ? "" : " before SoulFire finished loading"}.`;
            }
            appendIntegratedLog(
              state,
              `Java process exited (${exitSignal ?? code ?? "unknown"}).`,
            );
          };
          const onClose = () => {
            if (state.child === child) {
              state.child = null;
              state.processFiber = null;
            }
            if (!ready)
              Deferred.doneUnsafe(
                readiness,
                Effect.fail(
                  new Error(
                    state.diagnostics.error ??
                      "SoulFire stopped before it finished loading",
                  ),
                ),
              );
            Deferred.doneUnsafe(closed, Effect.void);
          };
          child.once("error", onError);
          child.once("exit", onExit);
          child.once("close", onClose);
          return { readers, onError, onExit, onClose };
        }),
        ({ readers, onError, onExit, onClose }) =>
          Effect.gen(function* () {
            // If the monitor is interrupted, reap the child before releasing readers.
            if (
              state.child === child &&
              child.exitCode === null &&
              child.signalCode === null
            )
              yield* Effect.promise(() => terminateIntegratedProcess(state));
            for (const reader of readers) reader.close();
            child.removeListener("error", onError);
            child.removeListener("exit", onExit);
            child.removeListener("close", onClose);
            if (state.child === child) {
              state.child = null;
              state.processFiber = null;
            }
          }),
      );
      yield* Deferred.await(closed);
    }),
  );
  state.processFiber = Effect.runFork(monitor);
  return Effect.runPromise(Deferred.await(readiness), { signal });
}

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { stripVTControlCharacters } from "node:util";
import type {
  DesktopIntegratedServerDiagnostics,
  DesktopIntegratedServerLog,
} from "../../src/lib/desktop-api";

const MAX_LOG_LINES = 2_000;
const MAX_LOG_CHARACTERS = 1_000_000;

export type IntegratedServerState = {
  child: ChildProcessWithoutNullStreams | null;
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

export function startIntegratedOperation(
  state: IntegratedServerState,
  operation: (signal: AbortSignal) => Promise<string>,
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
  state.startup = (async () => {
    try {
      const credentials = await operation(controller.signal);
      controller.signal.throwIfAborted();
      if (
        !state.child ||
        state.child.exitCode !== null ||
        state.child.signalCode !== null
      )
        throw new Error("SoulFire exited before startup completed");
      state.diagnostics.status = "running";
      return credentials;
    } catch (error) {
      if (!controller.signal.aborted) {
        state.diagnostics.error =
          error instanceof Error ? error.message : String(error);
        appendIntegratedLog(state, state.diagnostics.error);
      }
      await terminateIntegratedProcess(state);
      state.diagnostics.status = controller.signal.aborted
        ? "stopped"
        : "failed";
      state.diagnostics.exitedAt ??= Date.now();
      if (controller.signal.aborted) return null;
      throw error;
    } finally {
      state.controller = null;
      state.startup = null;
    }
  })();
  return state.startup;
}

export async function killIntegratedServer(
  state: IntegratedServerState,
): Promise<void> {
  if (!state.startup && !state.child && !state.termination) return;
  state.diagnostics.status = "stopping";
  state.controller?.abort(new Error("Integrated server startup cancelled"));
  // Keep the startup occupied until downloads, extraction, and process shutdown settle.
  await Promise.all([
    terminateIntegratedProcess(state),
    state.startup?.catch(() => undefined),
  ]);
  state.diagnostics.status = "stopped";
}

export function terminateIntegratedProcess(
  state: IntegratedServerState,
  gracePeriodMs = 5_000,
): Promise<void> {
  if (state.termination) return state.termination;
  const child = state.child;
  if (!child) return Promise.resolve();

  state.termination = new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(forceTimer);
      clearTimeout(failureTimer);
      child.removeListener("close", finish);
      resolve();
    };
    const forceTimer = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      appendIntegratedLog(
        state,
        "Java did not stop gracefully. Forcing it to stop.",
      );
      child.kill("SIGKILL");
    }, gracePeriodMs);
    const failureTimer = setTimeout(() => {
      child.removeListener("close", finish);
      reject(
        new Error(
          "Java did not exit after a forced stop. Check the process in your system monitor.",
        ),
      );
    }, gracePeriodMs + 5_000);
    child.once("close", finish);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  }).finally(() => {
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

  return new Promise<void>((resolve, reject) => {
    let ready = false;
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    const readers = (["stdout", "stderr"] as const).map((source) => {
      const reader = readline.createInterface({ input: child[source] });
      reader.on("line", (rawLine) => {
        if (state.child !== child) return;
        const line = appendIntegratedLog(state, rawLine, source);
        if (!line) return;
        if (line.includes("Finished loading!")) {
          ready = true;
          signal.removeEventListener("abort", onAbort);
          resolve();
        }
      });
      return reader;
    });
    child.once("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      if (state.child === child) {
        state.diagnostics.error = error.message;
        if (!child.pid) state.child = null;
      }
      reject(error);
    });
    child.once("exit", (code, exitSignal) => {
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
      // Keep the child until close so the last stdout/stderr lines are retained.
    });
    child.once("close", () => {
      for (const reader of readers) reader.close();
      signal.removeEventListener("abort", onAbort);
      if (state.child === child) state.child = null;
      if (!ready)
        reject(
          new Error(
            state.diagnostics.error ??
              "SoulFire stopped before it finished loading",
          ),
        );
    });
    if (signal.aborted) onAbort();
  });
}

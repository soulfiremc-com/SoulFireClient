import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { test } from "node:test";
import { Effect } from "effect";
import {
  appendIntegratedLog,
  createIntegratedServerState,
  killIntegratedServer,
  startIntegratedOperation,
  terminateIntegratedProcess,
  waitForIntegratedServerReady,
} from "./integrated-server-process";

test("cancellation waits for preparation cleanup and prevents an overlapping retry", async () => {
  const state = createIntegratedServerState();
  const cleanup = new EventEmitter();
  const cleanupDone = once(cleanup, "done");
  const operation = startIntegratedOperation(state, async (signal) => {
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    await cleanupDone;
    signal.throwIfAborted();
    return "";
  });
  const cancelling = killIntegratedServer(state);
  assert.equal(state.controller?.signal.aborted, true);
  await assert.rejects(startIntegratedOperation(state, async () => ""));
  assert.notEqual(state.startup, null);
  cleanup.emit("done");
  await cancelling;
  assert.equal(await operation, null);
  assert.equal(state.startup, null);
  assert.equal(state.diagnostics.status, "stopped");
});

test(
  "cancelling a process stuck before readiness releases startup and reaps the child",
  {
    timeout: 10_000,
  },
  async () => {
    const state = createIntegratedServerState();
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {
        stdio: "pipe",
      },
    );
    const operation = startIntegratedOperation(state, async (signal) => {
      await waitForIntegratedServerReady(state, child, signal);
      return "";
    });
    await killIntegratedServer(state);
    assert.equal(await operation, null);
    assert.equal(state.child, null);
    assert.notEqual(child.exitCode ?? child.signalCode, null);
    assert.equal(state.diagnostics.error, null);
  },
);

test(
  "early exit records the exit code and trailing stderr",
  {
    timeout: 10_000,
  },
  async () => {
    const state = createIntegratedServerState();
    const child = spawn(
      process.execPath,
      ["-e", "console.error('failure'); process.exitCode = 7"],
      { stdio: "pipe" },
    );
    await assert.rejects(
      startIntegratedOperation(state, async (signal) => {
        await waitForIntegratedServerReady(state, child, signal);
        return "";
      }),
    );
    assert.equal(state.diagnostics.exitCode, 7);
    assert.equal(state.diagnostics.status, "failed");
    assert.ok(state.diagnostics.logs.some((log) => log.source === "stderr"));
    assert.equal(state.child, null);
  },
);

test(
  "logs and exit status remain available after a ready process crashes",
  {
    timeout: 10_000,
  },
  async () => {
    const state = createIntegratedServerState();
    const child = spawn(
      process.execPath,
      [
        "-e",
        "console.log('Finished loading!'); process.stdin.once('data', () => { console.error('crash'); process.exitCode = 9; process.stdin.destroy(); });",
      ],
      { stdio: "pipe" },
    );
    const result = await startIntegratedOperation(state, async (signal) => {
      await waitForIntegratedServerReady(state, child, signal);
      return "credentials";
    });
    assert.notEqual(result, null);
    assert.equal(state.diagnostics.status, "running");
    const closed = once(child, "close");
    child.stdin.end("exit");
    await closed;
    assert.equal(state.diagnostics.exitCode, 9);
    assert.equal(state.diagnostics.status, "failed");
    assert.ok(state.diagnostics.logs.some((log) => log.source === "stderr"));
  },
);

test(
  "shutdown escalates when Java ignores the initial stop signal",
  {
    timeout: 10_000,
    skip: process.platform === "win32",
  },
  async () => {
    const state = createIntegratedServerState();
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); console.log('Finished loading!'); setInterval(() => {}, 1000);",
      ],
      { stdio: "pipe" },
    );
    await waitForIntegratedServerReady(
      state,
      child,
      new AbortController().signal,
    );
    state.diagnostics.status = "stopping";
    await terminateIntegratedProcess(state, 50);
    assert.equal(child.signalCode, "SIGKILL");
    assert.equal(state.child, null);
  },
);

test("diagnostic output stays bounded while retaining stable log identities", () => {
  const state = createIntegratedServerState();
  for (let count = 0; count < 3_000; count++)
    appendIntegratedLog(state, "x".repeat(1_000));
  assert.ok(state.logCharacters <= 1_000_000);
  assert.ok(state.diagnostics.logs.length <= 2_000);
  assert.ok(state.diagnostics.droppedLogCount > 0);
  assert.equal(
    new Set(state.diagnostics.logs.map((log) => log.id)).size,
    state.diagnostics.logs.length,
  );
});

test("process diagnostics strip interaction controls and retain token redaction", () => {
  const state = createIntegratedServerState();
  const payload = Buffer.from(
    JSON.stringify({
      click: { action: "copy_to_clipboard", value: "hidden-token" },
    }),
  ).toString("base64url");
  const message = appendIntegratedLog(
    state,
    `\x1b]777;soulfire;1;${payload}\x1b\\Copy token\x1b]777;soulfire;1;-\x1b\\ \x1b[31mtext\x1b[0m Bearer visible-token`,
    "stdout",
  );
  assert.equal(message, "Copy token text Bearer [redacted]");
  assert.equal(state.diagnostics.logs[0].message, message);
  assert.equal(state.diagnostics.logs[0].source, "stdout");
});

test("cancelling Effect preparation awaits scoped finalizers before allowing another startup", async () => {
  const state = createIntegratedServerState();
  const cleanup = new EventEmitter();
  const cleanupDone = once(cleanup, "done");
  let releasing = false;
  const operation = startIntegratedOperation(state, () =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          releasing = true;
          await cleanupDone;
        }),
      );
      return yield* Effect.never;
    }),
  );
  const stopping = killIntegratedServer(state);
  await assert.rejects(
    startIntegratedOperation(state, async () => ""),
    {
      message:
        "The integrated server is already starting, running, or stopping",
    },
  );
  assert.equal(releasing, true);
  assert.notEqual(state.startup, null);
  cleanup.emit("done");
  await stopping;
  assert.equal(await operation, null);
  assert.equal(state.startup, null);
  assert.equal(state.diagnostics.status, "stopped");
});

test("failed Effect preparation releases its scope and preserves the original error", async () => {
  const state = createIntegratedServerState();
  const error = new Error("JVM extraction failed");
  let released = false;
  await assert.rejects(
    startIntegratedOperation(state, () =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            released = true;
          }),
        );
        return yield* Effect.fail(error);
      }),
    ),
    (cause) => cause === error,
  );
  assert.equal(released, true);
  assert.equal(state.diagnostics.status, "failed");
  assert.equal(state.diagnostics.error, error.message);
  assert.equal(state.startup, null);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { App } from "electron";
import {
  lastIntegratedLogId,
  mergeIntegratedDiagnostics,
} from "../../src/lib/integrated-diagnostics";
import type { DesktopIntegratedServerDiagnostics } from "../../src/lib/desktop-api";
import { getIntegratedDiagnostics } from "./integrated-server-diagnostics";
import {
  appendIntegratedLog,
  createIntegratedServerState,
} from "./integrated-server-process";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
const app = { getPath: () => "/tmp/soulfire-test" } as unknown as App;

function createState() {
  const state = createIntegratedServerState();
  // Skip the jcmd search, which looks for a JDK on this machine.
  state.jcmdPath = null;
  return state;
}

// IPC copies the result, so the renderer never shares the main process array.
function fetchDiagnostics(
  state: ReturnType<typeof createIntegratedServerState>,
  afterLogId: number | undefined,
) {
  return structuredClone(getIntegratedDiagnostics(app, state, afterLogId));
}

function poll(
  state: ReturnType<typeof createIntegratedServerState>,
  previous: DesktopIntegratedServerDiagnostics | undefined,
) {
  return mergeIntegratedDiagnostics(
    previous,
    fetchDiagnostics(state, lastIntegratedLogId(previous)),
  );
}

test("polls send only new log lines and keep the full history in the renderer", () => {
  const state = createState();
  appendIntegratedLog(state, "first");
  appendIntegratedLog(state, "second");
  const initial = poll(state, undefined);
  assert.deepEqual(
    initial.logs.map((log) => log.message),
    ["first", "second"],
  );

  appendIntegratedLog(state, "third");
  const update = fetchDiagnostics(state, lastIntegratedLogId(initial));
  assert.deepEqual(
    update.logs.map((log) => log.message),
    ["third"],
  );
  const merged = mergeIntegratedDiagnostics(initial, update);
  assert.deepEqual(
    merged.logs.map((log) => log.message),
    ["first", "second", "third"],
  );
  assert.equal(poll(state, merged).logs, merged.logs);
});

test("dropped and restarted logs replace what the renderer had", () => {
  const state = createState();
  appendIntegratedLog(state, "old");
  const before = poll(state, undefined);

  appendIntegratedLog(state, "kept");
  state.diagnostics.logs.shift();
  state.diagnostics.droppedLogCount++;
  const trimmed = poll(state, before);
  assert.deepEqual(
    trimmed.logs.map((log) => log.message),
    ["kept"],
  );

  // A new startup clears the buffer. The last seen ID no longer exists.
  state.diagnostics.logs = [];
  appendIntegratedLog(state, "new run");
  assert.deepEqual(
    poll(state, trimmed).logs.map((log) => log.message),
    ["new run"],
  );
});

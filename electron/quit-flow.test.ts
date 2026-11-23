import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuitFlow } from "./quit-flow";

function setup() {
  const calls: string[] = [];
  let open = true;
  const flow = createQuitFlow({
    getWindow: () =>
      open
        ? {
            close: () => {
              calls.push("close");
            },
            isDestroyed: () => false,
          }
        : null,
    cleanup: async () => {
      calls.push("cleanup");
    },
    quit: () => {
      calls.push("quit");
      // Electron emits before-quit again for each quit call.
      flow.beforeQuit();
    },
  });
  return {
    flow,
    calls,
    closeWindow: () => {
      open = false;
      flow.windowClosed();
    },
  };
}

test("quitting closes the window before cleanup and finishes after it closes", async () => {
  const { flow, calls, closeWindow } = setup();
  assert.equal(flow.beforeQuit(), true);
  assert.deepEqual(calls, ["close"]);

  closeWindow();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["close", "quit", "cleanup", "quit"]);
  assert.equal(flow.beforeQuit(), false);
});

test("staying on the page cancels the quit without cleanup", async () => {
  const { flow, calls, closeWindow } = setup();
  flow.beforeQuit();
  flow.closeCancelled();
  await Promise.resolve();
  assert.deepEqual(calls, ["close"]);

  // A later plain window close, for example on macOS, does not quit.
  closeWindow();
  await Promise.resolve();
  assert.deepEqual(calls, ["close"]);
});

test("an update installs only after the window closes and cleanup finishes", async () => {
  const { flow, calls, closeWindow } = setup();
  flow.quitWith(() => {
    calls.push("install");
  });
  assert.deepEqual(calls, ["quit", "close"]);
  assert.equal(flow.isQuitting(), false);

  closeWindow();
  assert.equal(flow.isQuitting(), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["quit", "close", "quit", "cleanup", "install"]);
});

test("staying on the page cancels a pending update install", async () => {
  const { flow, calls, closeWindow } = setup();
  flow.quitWith(() => {
    calls.push("install");
  });
  flow.closeCancelled();

  // A later normal quit must not install the update.
  flow.beforeQuit();
  closeWindow();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [
    "quit",
    "close",
    "close",
    "quit",
    "cleanup",
    "quit",
  ]);
});

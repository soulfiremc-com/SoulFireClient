import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diagnoseLauncherFailure,
  getLauncherStartupStage,
} from "./launcher-startup.ts";

const log = (message: string) => ({
  id: 1,
  timestamp: 0,
  source: "stderr" as const,
  message,
});

test("startup waits on preparation until the process exists", () => {
  assert.equal(getLauncherStartupStage(undefined), "prepare");
  assert.equal(
    getLauncherStartupStage({ status: "preparing", processStartedAt: null }),
    "prepare",
  );
});

test("startup moves to starting once the process runs", () => {
  assert.equal(
    getLauncherStartupStage({ status: "starting", processStartedAt: 10 }),
    "start",
  );
});

test("a running process still counts as connecting", () => {
  assert.equal(
    getLauncherStartupStage({ status: "running", processStartedAt: 10 }),
    "connect",
  );
});

test("recognizes actionable startup failures", () => {
  const cases = [
    [
      "Error: Could not bind to port 38765: address already in use",
      "port-in-use",
    ],
    ["java.lang.OutOfMemoryError: Java heap space", "out-of-memory"],
    ["Unrecognized VM option 'UseFoo'", "java"],
    ["Error: Invalid or corrupt jarfile /a.jar", "custom-jar"],
    ["Download failed: ETIMEDOUT", "download"],
  ] as const;
  for (const [message, kind] of cases) {
    assert.equal(
      diagnoseLauncherFailure({ error: null, logs: [log(message)] }),
      kind,
    );
  }
});

test("reads the launcher error as well as the logs", () => {
  assert.equal(
    diagnoseLauncherFailure({ error: "port 38765 in use", logs: [] }),
    "port-in-use",
  );
});

test("does not guess a fix for unrecognized output", () => {
  assert.equal(
    diagnoseLauncherFailure({ error: "exited with code 1", logs: [] }),
    "unknown",
  );
  assert.equal(diagnoseLauncherFailure(undefined), "unknown");
});

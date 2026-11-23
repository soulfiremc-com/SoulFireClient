import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearIntegratedServerPid,
  stopStaleIntegratedServer,
  writeIntegratedServerPid,
} from "./integrated-server-pid";

async function setup(context: { after: (fn: () => unknown) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "soulfire-pid-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const jarPath = path.join(directory, "SoulFireDedicated-test.jar");
  // The script ignores its arguments, so the jar path only marks the process.
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)", jarPath],
    { stdio: "ignore" },
  );
  context.after(() => child.kill("SIGKILL"));
  assert.ok(child.pid);
  return {
    child,
    pid: child.pid,
    jarPath,
    pidFilePath: path.join(directory, "integrated-server.pid"),
  };
}

const fileExists = (filePath: string) =>
  stat(filePath).then(
    () => true,
    () => false,
  );

test(
  "a server left running by an earlier session is stopped before the next start",
  { timeout: 15_000, skip: process.platform === "win32" },
  async (context) => {
    const { child, pid, jarPath, pidFilePath } = await setup(context);
    await writeIntegratedServerPid(pidFilePath, {
      pid,
      jarPath,
      startedAt: 0,
    });
    const exited = once(child, "exit");
    const reports: string[] = [];

    await stopStaleIntegratedServer(pidFilePath, (message) => {
      reports.push(message);
    });

    await exited;
    assert.equal(child.signalCode, "SIGTERM");
    assert.equal(reports.length, 1);
    assert.equal(await fileExists(pidFilePath), false);
  },
);

test(
  "a reused process ID is not stopped when the command line names another jar",
  { timeout: 15_000, skip: process.platform === "win32" },
  async (context) => {
    const { child, pid, pidFilePath } = await setup(context);
    await writeIntegratedServerPid(pidFilePath, {
      pid,
      jarPath: "/elsewhere/other.jar",
      startedAt: 0,
    });

    await stopStaleIntegratedServer(pidFilePath, () => {
      assert.fail("Nothing should be reported");
    });

    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    assert.equal(await fileExists(pidFilePath), false);
  },
);

test("an unreadable record is discarded and only the owner clears a record", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "soulfire-pid-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const pidFilePath = path.join(directory, "integrated-server.pid");
  await writeFile(pidFilePath, "not json");
  await stopStaleIntegratedServer(pidFilePath, () => {});
  assert.equal(await fileExists(pidFilePath), false);

  await writeIntegratedServerPid(pidFilePath, {
    pid: 123,
    jarPath: "a.jar",
    startedAt: 0,
  });
  await clearIntegratedServerPid(pidFilePath, 456);
  assert.equal(await fileExists(pidFilePath), true);
  await clearIntegratedServerPid(pidFilePath, 123);
  assert.equal(await fileExists(pidFilePath), false);
});

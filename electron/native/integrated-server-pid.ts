import { execFile } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { Schema } from "effect";

// oxlint-disable-next-line typescript/strict-void-return -- promisify reads the result from the execFile callback, not from the returned ChildProcess
const executeFile = promisify(execFile);

const PidRecordSchema = Schema.Struct({
  pid: Schema.Int,
  jarPath: Schema.String,
  startedAt: Schema.Finite,
});
type PidRecord = typeof PidRecordSchema.Type;

const decodeRecord = Schema.decodeUnknownSync(
  Schema.fromJsonString(PidRecordSchema),
);
const encodeRecord = Schema.encodeSync(Schema.fromJsonString(PidRecordSchema));

async function readRecord(pidFilePath: string): Promise<PidRecord | null> {
  try {
    return decodeRecord(await readFile(pidFilePath, "utf8"));
  } catch {
    return null;
  }
}

/** Records the Java process so a later launch can find it after a crash. */
export async function writeIntegratedServerPid(
  pidFilePath: string,
  record: PidRecord,
): Promise<void> {
  const temporary = `${pidFilePath}.tmp`;
  await writeFile(temporary, encodeRecord(record), "utf8");
  await rename(temporary, pidFilePath);
}

/** Removes the record when it still belongs to the given process. */
export async function clearIntegratedServerPid(
  pidFilePath: string,
  pid: number,
): Promise<void> {
  if ((await readRecord(pidFilePath))?.pid === pid)
    await rm(pidFilePath, { force: true });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function commandLine(pid: number): Promise<string | null> {
  try {
    if (process.platform === "linux")
      return (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll(
        "\0",
        " ",
      );
    if (process.platform === "win32") {
      const { stdout } = await executeFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { timeout: 10_000, windowsHide: true },
      );
      return stdout;
    }
    const { stdout } = await executeFile(
      "ps",
      ["-ww", "-p", String(pid), "-o", "command="],
      { timeout: 10_000 },
    );
    return stdout;
  } catch {
    return null;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(100);
  }
  return true;
}

/**
 * Stops a Java process that an earlier launch left running, for example after
 * Electron crashed or was killed. Otherwise a second server would start on the
 * same data directory. The process is only stopped when its command line still
 * names the recorded jar, so a reused PID never stops an unrelated process.
 */
export async function stopStaleIntegratedServer(
  pidFilePath: string,
  report: (message: string) => void,
  gracePeriodMs = 10_000,
): Promise<void> {
  const record = await readRecord(pidFilePath);
  if (record === null) {
    await rm(pidFilePath, { force: true });
    return;
  }
  const running = isAlive(record.pid) ? await commandLine(record.pid) : null;
  const matches =
    running !== null &&
    (process.platform === "win32"
      ? running.toLowerCase().includes(record.jarPath.toLowerCase())
      : running.includes(record.jarPath));
  if (matches) {
    report(
      `Stopping a SoulFire server that an earlier session left running (PID ${record.pid}).`,
    );
    // Windows has no SIGTERM, so this stops the process at once there.
    process.kill(record.pid, "SIGTERM");
    if (!(await waitForExit(record.pid, gracePeriodMs))) {
      process.kill(record.pid, "SIGKILL");
      if (!(await waitForExit(record.pid, 5000)))
        throw new Error(
          `A SoulFire server from an earlier session (PID ${record.pid}) is still running. Stop it in your system monitor, then try again.`,
        );
    }
  }
  await rm(pidFilePath, { force: true });
}

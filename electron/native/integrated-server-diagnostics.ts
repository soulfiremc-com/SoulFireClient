import { type ChildProcess, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { App } from "electron";
import type { DesktopIntegratedServerDiagnosticsUpdate } from "../../src/lib/desktop-api";
import { getAppLocalDataDir } from "./app-paths";
import {
  appendIntegratedLog,
  type IntegratedServerState,
} from "./integrated-server-process";

// oxlint-disable-next-line typescript/strict-void-return -- promisify reads the result from the execFile callback, not from the returned ChildProcess
const executeFile = promisify(execFile);

export async function validateJcmd(executable: string): Promise<void> {
  if (
    path.basename(executable).toLowerCase() !==
    (process.platform === "win32" ? "jcmd.exe" : "jcmd")
  ) {
    throw new Error("Choose the jcmd executable from a JDK 25 bin directory.");
  }
  await access(executable, constants.X_OK);
  const result = await executeFile(executable, ["-J-version"], {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
  });
  if (!/version "25(?:[.\-+"])/u.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(
      "Thread dumps require jcmd from JDK 25 to match the integrated server.",
    );
  }
}

async function findJcmd(state: IntegratedServerState): Promise<string | null> {
  const name = process.platform === "win32" ? "jcmd.exe" : "jcmd";
  const directories = [
    state.diagnostics.javaPath
      ? path.dirname(state.diagnostics.javaPath)
      : null,
    process.env["JAVA_HOME"]
      ? path.join(process.env["JAVA_HOME"], "bin")
      : null,
    ...(process.env["PATH"] ?? "").split(path.delimiter).filter(Boolean),
  ];
  for (const directory of new Set(directories)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      await validateJcmd(candidate);
      return candidate;
    } catch {
      // A missing or incompatible JDK must not block the other diagnostics.
    }
  }
  return null;
}

export function integratedDataDirectory(
  app: App,
  state: IntegratedServerState,
): string {
  return state.diagnostics.dataDirectory || getAppLocalDataDir(app);
}

export function getIntegratedDiagnostics(
  app: App,
  state: IntegratedServerState,
  afterLogId?: unknown,
): DesktopIntegratedServerDiagnosticsUpdate {
  if (state.jcmdPath === undefined && !state.jcmdSearch) {
    state.jcmdSearch = findJcmd(state)
      .then((executable) => {
        state.jcmdPath ??= executable;
        return undefined;
      })
      .finally(() => {
        state.jcmdSearch = null;
      });
  }
  const { logs } = state.diagnostics;
  // Send only new lines while the caller still has the line it last saw.
  // A new startup clears the logs, so the caller then gets the full list.
  const lastSeen =
    typeof afterLogId === "number"
      ? logs.findIndex((log) => log.id === afterLogId)
      : -1;
  return {
    ...state.diagnostics,
    dataDirectory: integratedDataDirectory(app, state),
    jcmdPath: state.jcmdPath ?? null,
    logs: lastSeen === -1 ? logs : logs.slice(lastSeen + 1),
    logsAfter: lastSeen === -1 ? null : (logs[lastSeen]?.id ?? null),
    firstLogId: logs[0]?.id ?? null,
  };
}

function isProcessRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

export async function captureIntegratedThreadDump(
  app: App,
  state: IntegratedServerState,
): Promise<string> {
  const child = state.child;
  if (!child?.pid || !isProcessRunning(child)) {
    throw new Error("The integrated Java process is not running.");
  }
  // Starts the jcmd search when it has not run yet.
  getIntegratedDiagnostics(app, state);
  await state.jcmdSearch;
  const jcmdPath = state.jcmdPath;
  if (!jcmdPath)
    throw new Error(
      "Choose jcmd from a JDK 25 installation first. The bundled Java runtime does not include it.",
    );

  const directory = path.join(
    integratedDataDirectory(app, state),
    "diagnostics",
  );
  await mkdir(directory, { recursive: true });
  const filePath = path.join(
    directory,
    `threads-${Date.now()}-${randomUUID().slice(0, 8)}.txt`,
  );
  // The process can exit while the search and the directory setup run.
  if (state.child !== child || !isProcessRunning(child)) {
    throw new Error(
      "The Java process exited before the thread dump could start.",
    );
  }
  try {
    // jcmd parses the diagnostic command itself, so quote the filename too.
    const result = await executeFile(
      jcmdPath,
      [
        String(child.pid),
        "Thread.dump_to_file",
        "-format=plain",
        JSON.stringify(
          process.platform === "win32"
            ? filePath.split("\\").join("/")
            : filePath,
        ),
      ],
      {
        timeout: 15_000,
        killSignal: "SIGKILL",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    const file = await stat(filePath).catch(() => null);
    if (!file?.size)
      throw new Error(
        result.stderr.trim() ||
          result.stdout.trim() ||
          "Java did not write a thread dump.",
      );
    appendIntegratedLog(state, `Thread dump saved to ${filePath}`);
    return filePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not capture the thread dump. Java may not be responding to diagnostic commands. ${message}`,
      { cause: error },
    );
  }
}

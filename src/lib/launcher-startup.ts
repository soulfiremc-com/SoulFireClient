import type { DesktopIntegratedServerDiagnostics } from "@/lib/desktop-api";

export type LauncherStartupStage = "prepare" | "start" | "connect";

export type LauncherFailureKind =
  | "port-in-use"
  | "out-of-memory"
  | "java"
  | "download"
  | "custom-jar"
  | "unknown";

/**
 * Maps the process state to the step the user is waiting on. The server is
 * only known to be ready when its credentials arrive, so a running process
 * still counts as connecting.
 */
export function getLauncherStartupStage(
  diagnostics:
    | Pick<DesktopIntegratedServerDiagnostics, "status" | "processStartedAt">
    | undefined,
): LauncherStartupStage {
  if (!diagnostics) return "prepare";
  if (diagnostics.status === "running") return "connect";
  if (diagnostics.status === "starting" && diagnostics.processStartedAt) {
    return "start";
  }
  return diagnostics.processStartedAt ? "start" : "prepare";
}

const FAILURE_PATTERNS: readonly (readonly [LauncherFailureKind, RegExp])[] = [
  ["port-in-use", /address already in use|could not bind|port .*in use/i],
  [
    "out-of-memory",
    /outofmemoryerror|could not reserve enough space|insufficient memory/i,
  ],
  [
    "custom-jar",
    /unable to access jarfile|invalid or corrupt jarfile|custom .*jar/i,
  ],
  [
    "java",
    /unrecognized vm option|could not create the java virtual machine|unsupportedclassversion|java (runtime|executable).*(not found|missing)/i,
  ],
  [
    "download",
    /download|checksum|enotfound|econnreset|etimedout|network error|fetch failed/i,
  ],
];

/**
 * Classifies a startup failure from the launcher error and the newest server
 * output. Only recognized messages get a specific recovery. Everything else
 * stays "unknown" so the UI does not suggest a fix that may not apply.
 */
export function diagnoseLauncherFailure(
  diagnostics:
    | Pick<DesktopIntegratedServerDiagnostics, "error" | "logs">
    | undefined,
): LauncherFailureKind {
  if (!diagnostics) return "unknown";
  const text = [
    diagnostics.error ?? "",
    ...diagnostics.logs.slice(-40).map((log) => log.message),
  ].join("\n");
  return (
    FAILURE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown"
  );
}

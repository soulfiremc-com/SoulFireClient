import type {
  DesktopIntegratedServerDiagnostics,
  DesktopIntegratedServerDiagnosticsUpdate,
} from "@/lib/desktop-api";

/** Applies a diagnostics poll to the logs the renderer already has. */
export function mergeIntegratedDiagnostics(
  previous: DesktopIntegratedServerDiagnostics | undefined,
  {
    logsAfter,
    firstLogId,
    ...update
  }: DesktopIntegratedServerDiagnosticsUpdate,
): DesktopIntegratedServerDiagnostics {
  if (logsAfter === null || previous === undefined) return update;
  const retained =
    firstLogId === null
      ? []
      : previous.logs.filter((log) => log.id >= firstLogId);
  return {
    ...update,
    logs:
      update.logs.length === 0 && retained.length === previous.logs.length
        ? previous.logs
        : [...retained, ...update.logs],
  };
}

/** The newest log ID the renderer has, to request only newer lines. */
export function lastIntegratedLogId(
  diagnostics: DesktopIntegratedServerDiagnostics | undefined,
): number | undefined {
  return diagnostics?.logs.at(-1)?.id;
}

import { create } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createClient, type Transport } from "@connectrpc/connect";
import { terminalLogText } from "@/lib/terminal-interactions";
import type { LogEntry } from "@/components/script-editor/types";
import { LogScopeSchema, LogsService } from "@/generated/soulfire/logs_pb";
import { createTerminalLogSession } from "@/stores/terminal-log-store";

export function scriptLogLevel(level: string | undefined): LogEntry["level"] {
  switch (level?.toLowerCase()) {
    case "warn":
    case "warning":
      return "warn";
    case "error":
    case "fatal":
      return "error";
    case "debug":
    case "trace":
      return "debug";
    default:
      return "info";
  }
}

export function mergeExecutionLogs(previous: LogEntry[], incoming: LogEntry[]) {
  const entries = new Map(previous.map((entry) => [entry.id, entry]));
  let changed = entries.size !== previous.length;
  for (const entry of incoming) {
    if (!entries.has(entry.id)) {
      entries.set(entry.id, entry);
      changed = true;
    }
  }
  if (!changed) return previous;
  return [...entries.values()]
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .slice(-500);
}

export function watchScriptLogs(
  transport: Transport,
  instanceId: string,
  scriptId: string,
  onLogs: (entries: LogEntry[]) => void,
) {
  const session = createTerminalLogSession(
    createClient(LogsService, transport),
    create(LogScopeSchema, {
      scope: { case: "instanceScript", value: { instanceId, scriptId } },
    }),
  );
  let seen = new Set<string>();
  const subscription = session.state.subscribe(() => {
    const entries = session.state.get().entries;
    const incoming = entries.filter((entry) => !seen.has(entry.id));
    seen = new Set(entries.map((entry) => entry.id));
    if (incoming.length === 0) return;
    onLogs(
      incoming.map((entry) => {
        return {
          id: entry.id,
          timestamp: entry.timestamp
            ? timestampDate(entry.timestamp)
            : new Date(),
          level: scriptLogLevel(entry.level),
          nodeId: null,
          // Preserve metadata only with the original independent provenance flags.
          // Frontend events and untrusted script output remain inert text.
          personal: entry.personal,
          terminalInteractions: entry.terminalInteractions === true,
          message:
            entry.personal && entry.terminalInteractions
              ? entry.message
              : terminalLogText(entry.message, false),
        };
      }),
    );
  });
  const release = session.retain();
  return () => {
    subscription.unsubscribe();
    release();
  };
}

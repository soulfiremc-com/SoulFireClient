import { createRpcClient } from "@/lib/rpc";
import { create } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { Transport } from "@connectrpc/connect";
import { Effect, Fiber } from "effect";
import { terminalLogText } from "@/lib/terminal-interactions";
import type { LogEntry } from "@/components/script-editor/types";
import { LogScopeSchema, LogsService } from "@/generated/soulfire/logs_pb";
import {
  emptyTerminalLogState,
  followTerminalLogs,
} from "@/stores/terminal-log-store";

export function scriptLogLevel(level: string | undefined): LogEntry["level"] {
  switch (level?.toLowerCase()) {
    case "warn":
    case "warning": {
      return "warn";
    }
    case "error":
    case "fatal": {
      return "error";
    }
    case "debug":
    case "trace": {
      return "debug";
    }
    case undefined:
    default: {
      return "info";
    }
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
    .toSorted((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .slice(-500);
}

export function watchScriptLogs(
  transport: Transport,
  instanceId: string,
  scriptId: string,
  onLogs: (entries: LogEntry[]) => void,
) {
  let state = emptyTerminalLogState;
  let stopped = false;
  const fiber = Effect.runFork(
    followTerminalLogs(
      createRpcClient(LogsService, transport),
      create(LogScopeSchema, {
        scope: { case: "instanceScript", value: { instanceId, scriptId } },
      }),
      (f) => {
        const previous = state.entries;
        state = f(state);
        if (stopped || state.entries === previous) return;
        const seen = new Set(previous.map((entry) => entry.id));
        const incoming = state.entries.filter((entry) => !seen.has(entry.id));
        if (incoming.length === 0) return;
        onLogs(
          incoming.map((entry) => ({
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
          })),
        );
      },
    ),
  );
  return () => {
    stopped = true;
    Effect.runFork(Fiber.interrupt(fiber));
  };
}

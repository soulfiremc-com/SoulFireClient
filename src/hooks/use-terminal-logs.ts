import { fromJsonString, toJsonString } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import { type LogScope, LogScopeSchema } from "@/generated/soulfire/logs_pb";
import {
  createTerminalLogSession,
  getTerminalLogSession,
} from "@/stores/terminal-log-store";

export function useTerminalLogs(transport: Transport | null, scope: LogScope) {
  const scopeKey = toJsonString(LogScopeSchema, scope);
  const session = useMemo(() => {
    const scope = fromJsonString(LogScopeSchema, scopeKey);
    return transport
      ? getTerminalLogSession(transport, scope)
      : createTerminalLogSession(null, scope);
  }, [transport, scopeKey]);
  useEffect(() => session.retain(), [session]);
  const entries = useSelector(session.lines);
  const historyLoaded = useSelector(
    session.state,
    (state) => state.historyLoaded,
  );
  return { entries, historyLoaded };
}

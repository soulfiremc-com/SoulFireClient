import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import { type LogScope, LogScopeSchema } from "@/generated/soulfire/logs_pb";
import {
  createTerminalLogSession,
  getTerminalLogSession,
  mergeTerminalLines,
} from "@/stores/terminal-log-store";

export function useTerminalLogs(transport: Transport | null, scope: LogScope) {
  const scopeKey = toJsonString(LogScopeSchema, scope);
  const sessions = useMemo(() => {
    const scope = fromJsonString(LogScopeSchema, scopeKey);
    const getSession = (scope: LogScope) =>
      transport
        ? getTerminalLogSession(transport, scope)
        : createTerminalLogSession(null, scope);
    const scoped = getSession(scope);
    const personal =
      scope.scope.case === "personal"
        ? scoped
        : getSession(
            create(LogScopeSchema, { scope: { case: "personal", value: {} } }),
          );
    return { scoped, personal };
  }, [transport, scopeKey]);
  useEffect(() => {
    const uniqueSessions = new Set([sessions.scoped, sessions.personal]);
    const releases = [...uniqueSessions].map((session) => session.retain());
    return () => {
      for (const release of releases) release();
    };
  }, [sessions]);
  const scopedEntries = useSelector(sessions.scoped.lines);
  const personalEntries = useSelector(sessions.personal.lines);
  const entries = useMemo(
    () =>
      sessions.scoped === sessions.personal
        ? scopedEntries
        : mergeTerminalLines(scopedEntries, personalEntries),
    [sessions, scopedEntries, personalEntries],
  );
  const scopedLoaded = useSelector(
    sessions.scoped.state,
    (state) => state.historyLoaded,
  );
  const personalLoaded = useSelector(
    sessions.personal.state,
    (state) => state.historyLoaded,
  );
  return { entries, historyLoaded: scopedLoaded && personalLoaded };
}

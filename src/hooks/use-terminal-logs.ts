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
    const parsedScope = fromJsonString(LogScopeSchema, scopeKey);
    const getSession = (logScope: LogScope) =>
      transport
        ? getTerminalLogSession(transport, logScope)
        : createTerminalLogSession(null, logScope);
    const scoped = getSession(parsedScope);
    const personal =
      parsedScope.scope.case === "personal"
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
  const scopedEntries = useSelector(
    sessions.scoped.state,
    (state) => state.entries,
  );
  const personalEntries = useSelector(
    sessions.personal.state,
    (state) => state.entries,
  );
  const entries = useMemo(
    () =>
      sessions.scoped === sessions.personal
        ? scopedEntries
        : // Both sessions are already bounded. Trimming the combined list
          // would shift its oldest entry on every message and replay the view.
          mergeTerminalLines(scopedEntries, personalEntries, false, false),
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
  // The personal scope only carries replies to this user, so a refusal of the
  // requested scope is what decides whether the logs are visible.
  const denied = useSelector(sessions.scoped.state, (state) => state.denied);
  return { entries, historyLoaded: scopedLoaded && personalLoaded, denied };
}

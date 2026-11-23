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

/**
 * Subscribes to the logs of a scope. With `includePersonal`, the replies to
 * this user's own commands are merged in. Only a view with a command prompt
 * asks for them: their links run commands through that prompt, so a
 * read-only view must not show them.
 */
export function useTerminalLogs(
  transport: Transport | null,
  scope: LogScope,
  includePersonal: boolean,
) {
  const scopeKey = toJsonString(LogScopeSchema, scope);
  const sessions = useMemo(() => {
    const parsedScope = fromJsonString(LogScopeSchema, scopeKey);
    const getSession = (logScope: LogScope) =>
      transport
        ? getTerminalLogSession(transport, logScope)
        : createTerminalLogSession(null, logScope);
    const scoped = getSession(parsedScope);
    const personal =
      !includePersonal || parsedScope.scope.case === "personal"
        ? scoped
        : getSession(
            create(LogScopeSchema, { scope: { case: "personal", value: {} } }),
          );
    return { scoped, personal };
  }, [transport, scopeKey, includePersonal]);
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
  // The personal scope only carries replies to this user, so a refusal of the
  // requested scope is what decides whether the logs are visible.
  const denied = useSelector(sessions.scoped.state, (state) => state.denied);
  const separatePersonal = sessions.scoped !== sessions.personal;
  const entries = useMemo(
    () =>
      !separatePersonal
        ? denied
          ? []
          : scopedEntries
        : denied
          ? // Replies to this user's own commands still arrive.
            personalEntries
          : // Both sessions are already bounded. Trimming the combined list
            // would shift its oldest entry on every message and replay the view.
            mergeTerminalLines(scopedEntries, personalEntries, false, false),
    [separatePersonal, denied, scopedEntries, personalEntries],
  );
  const scopedLoaded = useSelector(
    sessions.scoped.state,
    (state) => state.historyLoaded,
  );
  const personalLoaded = useSelector(
    sessions.personal.state,
    (state) => state.historyLoaded,
  );
  return { entries, historyLoaded: scopedLoaded && personalLoaded, denied };
}

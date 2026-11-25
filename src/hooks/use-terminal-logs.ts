import { useAtomMount, useAtomValue } from "@effect/atom-react";
import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { useMemo } from "react";
import { type LogScope, LogScopeSchema } from "@/generated/soulfire/logs_pb";
import {
  mergeTerminalLines,
  terminalLogAtoms,
} from "@/stores/terminal-log-store";

const personalScope = create(LogScopeSchema, {
  scope: { case: "personal", value: {} },
});

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
  const scoped = terminalLogAtoms(transport, scope);
  const personal =
    !includePersonal || scope.scope.case === "personal"
      ? scoped
      : terminalLogAtoms(transport, personalScope);
  useAtomMount(scoped.session);
  useAtomMount(personal.session);
  const scopedState = useAtomValue(scoped.state);
  const personalState = useAtomValue(personal.state);
  // The personal scope only carries replies to this user, so a refusal of the
  // requested scope is what decides whether the logs are visible.
  const denied = scopedState.denied;
  const separatePersonal = scoped.state !== personal.state;
  const scopedEntries = scopedState.entries;
  const personalEntries = personalState.entries;
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
  return {
    entries,
    historyLoaded: scopedState.historyLoaded && personalState.historyLoaded,
    denied,
  };
}

import { toJsonString } from "@bufbuild/protobuf";
import { type Client, createClient, type Transport } from "@connectrpc/connect";
import {
  type LogScope,
  LogScopeSchema,
  type LogString,
  LogsService,
} from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import { createStore } from "@tanstack/store";

export type TerminalLine = Pick<LogString, "id" | "message" | "personal"> &
  Partial<
    Omit<LogString, "$typeName" | "$unknown" | "id" | "message" | "personal">
  > & { lines: number };
type LogClient = Pick<Client<typeof LogsService>, "getPrevious" | "subscribe">;
const MAX_LINES = 500;
const FLUSH_INTERVAL = 50;
const IDLE_RETENTION = 5 * 60_000;

export function toTerminalLine(
  message: Omit<TerminalLine, "lines">,
): TerminalLine {
  return { ...message, lines: message.message.split("\n").length };
}

export function mergeTerminalLines(
  previous: TerminalLine[],
  incoming: TerminalLine[],
  prepend = false,
) {
  const existing = new Map(previous.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const merged: TerminalLine[] = [];
  for (const entry of prepend
    ? [...incoming, ...previous]
    : [...previous, ...incoming]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(existing.get(entry.id) ?? entry);
  }
  let lines = 0;
  let first = merged.length;
  while (first > 0 && lines + merged[first - 1].lines <= MAX_LINES) {
    lines += merged[--first].lines;
  }
  const bounded = merged.slice(first);
  return bounded.length === previous.length &&
    bounded.every((entry, i) => entry === previous[i])
    ? previous
    : bounded;
}

export function createTerminalLogSession(
  client: LogClient | null,
  scope: LogScope,
  onActivity: (active: boolean) => void = () => {},
) {
  const state = createStore({
    entries: [] as TerminalLine[],
    historyLoaded: false,
  });
  const lines = createStore(() =>
    state
      .get()
      .entries.filter(
        (entry, i, all) => i === 0 || entry.message !== all[i - 1].message,
      ),
  );
  let consumers = 0;
  let controller: AbortController | undefined;
  let pending: TerminalLine[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (pending.length === 0) return;
    const incoming = pending;
    pending = [];
    state.setState((current) => {
      const entries = mergeTerminalLines(current.entries, incoming);
      return entries === current.entries ? current : { ...current, entries };
    });
  }

  function start() {
    if (!client) return;
    const activeClient = client;
    const abort = new AbortController();
    controller = abort;
    void activeClient
      .getPrevious({ scope, count: 300 }, { signal: abort.signal })
      .then((response) => {
        if (abort.signal.aborted) return;
        flush();
        state.setState((current) => ({
          entries: mergeTerminalLines(
            current.entries,
            response.messages.map(toTerminalLine),
            true,
          ),
          historyLoaded: true,
        }));
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        console.error("Could not load previous logs", error);
        state.setState((current) => ({ ...current, historyLoaded: true }));
      });

    async function watch() {
      let delay = 1000;
      try {
        for await (const response of activeClient.subscribe(
          { scope },
          { signal: abort.signal },
        )) {
          if (abort.signal.aborted) return;
          if (!response.message) continue;
          // Bound the pending batch too, even when the main thread is busy.
          pending = mergeTerminalLines(pending, [
            toTerminalLine(response.message),
          ]);
          flushTimer ??= setTimeout(flush, FLUSH_INTERVAL);
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        console.error("Log stream ended", error);
        delay = 3000;
      }
      if (!abort.signal.aborted)
        retryTimer = setTimeout(() => void watch(), delay);
    }
    void watch();
  }

  return {
    state,
    lines,
    get active() {
      return consumers > 0;
    },
    retain() {
      if (consumers++ === 0) {
        onActivity(true);
        start();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--consumers !== 0) return;
        controller?.abort();
        clearTimeout(retryTimer);
        flush();
        onActivity(false);
      };
    },
  };
}

type CachedSession = {
  session: ReturnType<typeof createTerminalLogSession>;
  idleSince: number;
};
const connections = new WeakMap<Transport, Map<string, CachedSession>>();

export function getTerminalLogSession(transport: Transport, scope: LogScope) {
  let scopes = connections.get(transport);
  if (!scopes) {
    scopes = new Map();
    connections.set(transport, scopes);
  }
  const now = Date.now();
  for (const [key, entry] of scopes) {
    if (!entry.session.active && now - entry.idleSince >= IDLE_RETENTION)
      scopes.delete(key);
  }
  const key = toJsonString(LogScopeSchema, scope);
  const cached = scopes.get(key);
  if (cached) return cached.session;
  // Keep abandoned renders and inactive scopes from growing the cache indefinitely.
  if (scopes.size >= 20) {
    for (const [oldKey, entry] of scopes) {
      if (entry.session.active) continue;
      scopes.delete(oldKey);
      if (scopes.size < 20) break;
    }
  }
  const session = createTerminalLogSession(
    createClient(LogsService, transport),
    scope,
    (active) => {
      entry.idleSince = active ? Number.POSITIVE_INFINITY : Date.now();
    },
  );
  const entry: CachedSession = { session, idleSince: now };
  scopes.set(key, entry);
  return session;
}

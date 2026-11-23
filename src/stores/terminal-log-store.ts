import { createRpcClient } from "@/lib/rpc";
import { toJsonString } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { createStore } from "@tanstack/store";
import { Effect, Fiber, Queue, Ref, Stream } from "effect";
import { getConnectionErrorKind } from "@/lib/connection-errors";
import {
  type LogClient,
  type TerminalLogError,
  TerminalLogs,
  terminalLogsLayer,
} from "@/lib/terminal-log-service";
import {
  type LogScope,
  LogScopeSchema,
  type LogString,
  LogsService,
} from "@/generated/soulfire/logs_pb";

export type TerminalLine = Pick<LogString, "id" | "message" | "personal"> &
  Partial<
    Omit<LogString, "$typeName" | "$unknown" | "id" | "message" | "personal">
  > & { lines: number };
const MAX_LINES = 500;
// The buffer may grow this far past MAX_LINES before it is trimmed. Trimming
// changes the oldest entry, which makes the terminal replay its whole buffer,
// so a busy log replays once per TRIM_SLACK lines instead of on every message.
const TRIM_SLACK = 50;
const FLUSH_INTERVAL = 50;
const IDLE_RETENTION = 5 * 60_000;

export function toTerminalLine(
  message: Omit<TerminalLine, "lines">,
): TerminalLine {
  return { ...message, lines: message.message.split("\n").length };
}

function compareTerminalLines(left: TerminalLine, right: TerminalLine): number {
  const a = left.timestamp;
  const b = right.timestamp;
  if (!a || !b) return 0;
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  if (a.nanos !== b.nanos) return a.nanos - b.nanos;
  // Published log IDs include a numeric sequence for equal timestamps.
  // Personal messages use UUIDs and keep their arrival order on a tie.
  const leftSequence = /^\d+-(-?\d+)$/u.exec(left.id)?.[1];
  const rightSequence = /^\d+-(-?\d+)$/u.exec(right.id)?.[1];
  return leftSequence !== undefined && rightSequence !== undefined
    ? Number(leftSequence) - Number(rightSequence)
    : 0;
}

export function mergeTerminalLines(
  previous: TerminalLine[],
  incoming: TerminalLine[],
  prepend = false,
  bounded = true,
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
  // A history snapshot can be newer than the oldest cached messages.
  merged.sort(compareTerminalLines);
  const total = merged.reduce((sum, entry) => sum + entry.lines, 0);
  const result =
    bounded && total > MAX_LINES + TRIM_SLACK
      ? trimTerminalLines(merged)
      : merged;
  return result.length === previous.length &&
    result.every((entry, i) => entry === previous[i])
    ? previous
    : result;
}

function trimTerminalLines(entries: TerminalLine[]): TerminalLine[] {
  let lines = 0;
  let first = entries.length;
  for (const entry of entries.toReversed()) {
    if (lines >= MAX_LINES) break;
    lines += entry.lines;
    first--;
  }
  const trimmed = entries.slice(first);
  const oldest = trimmed[0];
  if (oldest && lines > MAX_LINES) {
    const retainedLines = oldest.lines - (lines - MAX_LINES);
    trimmed[0] = {
      ...oldest,
      message: oldest.message.split("\n").slice(-retainedLines).join("\n"),
      lines: retainedLines,
    };
  }
  return trimmed;
}

// Retrying cannot fix a missing permission or sign-in, so the session stops.
function isAccessDenied(error: TerminalLogError): boolean {
  const kind = getConnectionErrorKind(error.cause);
  return kind === "permission" || kind === "authentication";
}

export function createTerminalLogSession(
  client: LogClient | null,
  scope: LogScope,
  onActivity: (active: boolean) => void = () => {},
) {
  const state = createStore({
    entries: [] as TerminalLine[],
    historyLoaded: false,
    // Set when the server refuses this scope. Retaining the session again retries.
    denied: false,
  });
  let consumers = 0;
  let generation = 0;
  // Each session owns its stop handle. Another session must never replace it.
  let stop: (() => void) | undefined;

  function start(): () => void {
    if (!client) return () => {};
    // Each retention lifetime owns its own batch. A retiring fiber cannot flush a new one.
    const pending = Ref.makeUnsafe<TerminalLine[]>([]);
    const flush = Effect.gen(function* () {
      const incoming = yield* Ref.getAndSet(pending, []);
      if (incoming.length === 0) return;
      state.setState((current) => {
        const entries = mergeTerminalLines(current.entries, incoming);
        return entries === current.entries ? current : { ...current, entries };
      });
    });
    const epoch = ++generation;
    const current = () => epoch === generation && consumers > 0;
    let denied = false;
    // A refused history request also ends the stream retry loop.
    const retrying = () => !denied;
    const deny = Effect.sync(() => {
      denied = true;
      if (!current()) return;
      state.setState((value) =>
        value.denied && value.historyLoaded
          ? value
          : { ...value, denied: true, historyLoaded: true },
      );
    });
    state.setState((value) =>
      value.denied ? { ...value, denied: false } : value,
    );
    const program = Effect.scoped(
      Effect.gen(function* () {
        const logs = yield* TerminalLogs;
        // Coalesce snapshot requests while retaining one catch-up behind an active request.
        const historyRequests = yield* Queue.sliding<undefined>(1);
        const flushRequests = yield* Queue.dropping<undefined>(1);
        const loadHistory = Effect.gen(function* () {
          yield* Queue.take(historyRequests);
          const result = yield* Effect.result(logs.history);
          if (!current()) return;
          if (result._tag === "Failure") {
            if (isAccessDenied(result.failure)) {
              yield* deny;
              return;
            }
            yield* Effect.logWarning(
              "Could not load previous logs",
              result.failure,
            );
            state.setState((value) =>
              value.historyLoaded ? value : { ...value, historyLoaded: true },
            );
            return;
          }
          yield* flush;
          state.setState((value) => {
            const entries = mergeTerminalLines(
              value.entries,
              result.success.messages.map(toTerminalLine),
              true,
            );
            return entries === value.entries && value.historyLoaded
              ? value
              : { ...value, entries, historyLoaded: true };
          });
        }).pipe(Effect.forever);
        yield* loadHistory.pipe(Effect.forkScoped);
        yield* Queue.take(flushRequests).pipe(
          Effect.andThen(Effect.sleep(FLUSH_INTERVAL)),
          Effect.andThen(flush),
          Effect.forever,
          Effect.forkScoped,
        );
        const attempt = Effect.suspend(() => {
          let first = true;
          return Effect.gen(function* () {
            yield* Queue.offer(historyRequests, undefined);
            yield* Stream.runForEach(logs.live, (response) =>
              Effect.gen(function* () {
                if (!current()) return;
                if (first) {
                  first = false;
                  // Close the gap between the initial snapshot and stream registration.
                  yield* Queue.offer(historyRequests, undefined);
                }
                const message = response.message;
                if (!message) return;
                yield* Ref.update(pending, (batch) =>
                  mergeTerminalLines(batch, [toTerminalLine(message)]),
                );
                yield* Queue.offer(flushRequests, undefined);
              }),
            );
          });
        });
        while (retrying()) {
          const result = yield* Effect.result(attempt);
          if (result._tag === "Failure") {
            if (isAccessDenied(result.failure)) {
              yield* deny;
              return;
            }
            yield* Effect.logWarning("Log stream ended", result.failure);
            yield* Effect.sleep(2000);
          }
          yield* Effect.sleep(1000);
        }
      }),
    ).pipe(Effect.provide(terminalLogsLayer(client, scope)), Effect.asVoid);
    const running = Effect.runFork(program);
    return () => {
      Effect.runSync(flush);
      Effect.runFork(Fiber.interrupt(running));
    };
  }

  return {
    state,
    get active() {
      return consumers > 0;
    },
    retain() {
      if (consumers++ === 0) {
        onActivity(true);
        stop = start();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--consumers !== 0) return;
        generation++;
        stop?.();
        stop = undefined;
        onActivity(false);
      };
    },
  };
}

interface CachedSession {
  session: ReturnType<typeof createTerminalLogSession>;
  idleSince: number;
}
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
    createRpcClient(LogsService, transport),
    scope,
    (active) => {
      entry.idleSince = active ? Number.POSITIVE_INFINITY : Date.now();
    },
  );
  const entry: CachedSession = { session, idleSince: now };
  scopes.set(key, entry);
  return session;
}

import { toJsonString } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { createStore } from "@tanstack/store";
import { Effect, Fiber, Queue, Ref, Schedule, Stream } from "effect";
import {
  type LogClient,
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
  const leftSequence = /^\d+-(-?\d+)$/.exec(left.id)?.[1];
  const rightSequence = /^\d+-(-?\d+)$/.exec(right.id)?.[1];
  return leftSequence !== undefined && rightSequence !== undefined
    ? Number(leftSequence) - Number(rightSequence)
    : 0;
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
  // A history snapshot can be newer than the oldest cached messages.
  merged.sort(compareTerminalLines);
  let lines = 0;
  let first = merged.length;
  while (first > 0 && lines < MAX_LINES) {
    lines += merged[--first].lines;
  }
  const bounded = merged.slice(first);
  if (lines > MAX_LINES) {
    const oldest = bounded[0];
    const retainedLines = oldest.lines - (lines - MAX_LINES);
    bounded[0] = {
      ...oldest,
      message: oldest.message.split("\n").slice(-retainedLines).join("\n"),
      lines: retainedLines,
    };
  }
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
  let generation = 0;
  let stop: () => void = () => {};

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
    const program = Effect.scoped(
      Effect.gen(function* () {
        const logs = yield* TerminalLogs;
        // Coalesce snapshot requests while retaining one catch-up behind an active request.
        const historyRequests = yield* Queue.sliding<void>(1);
        const flushRequests = yield* Queue.dropping<void>(1);
        const loadHistory = Effect.gen(function* () {
          yield* Queue.take(historyRequests);
          const result = yield* Effect.result(logs.history);
          if (!current()) return;
          if (result._tag === "Failure") {
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
              : { entries, historyLoaded: true };
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
        yield* attempt.pipe(
          Effect.catch((error) =>
            Effect.logWarning("Log stream ended", error).pipe(
              Effect.andThen(Effect.sleep(2000)),
            ),
          ),
          Effect.repeat(Schedule.spaced(1000)),
        );
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
    lines,
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
        stop();
        stop = () => {};
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

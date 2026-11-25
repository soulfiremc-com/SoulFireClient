import { createRpcClient } from "@/lib/rpc";
import { fromJsonString, toJsonString } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { Effect, Queue, Ref, Stream } from "effect";
import { type AsyncResult, Atom } from "effect/reactivity";
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

export interface TerminalLogState {
  readonly entries: TerminalLine[];
  readonly historyLoaded: boolean;
  /** Set when the server refuses this scope. Following it again retries. */
  readonly denied: boolean;
}

export const emptyTerminalLogState: TerminalLogState = {
  entries: [],
  historyLoaded: false,
  denied: false,
};

export type UpdateTerminalLogState = (
  f: (state: TerminalLogState) => TerminalLogState,
) => void;

/**
 * Follows the logs of one scope until it is interrupted. It loads the
 * history, streams new messages in batches and reconnects when the stream
 * ends. Interrupting it writes the pending batch and ignores late responses.
 */
export function followTerminalLogs(
  client: LogClient,
  scope: LogScope,
  update: UpdateTerminalLogState,
): Effect.Effect<void> {
  return Effect.scoped(
    Effect.gen(function* () {
      const logs = yield* TerminalLogs;
      const pending = yield* Ref.make<TerminalLine[]>([]);
      const flush = Effect.gen(function* () {
        const incoming = yield* Ref.getAndSet(pending, []);
        if (incoming.length === 0) return;
        update((current) => {
          const entries = mergeTerminalLines(current.entries, incoming);
          return entries === current.entries
            ? current
            : { ...current, entries };
        });
      });
      yield* Effect.addFinalizer(() => flush);
      let denied = false;
      // Logs cached before the refusal must not stay visible without access.
      const deny = Effect.andThen(
        Ref.set(pending, []),
        Effect.sync(() => {
          denied = true;
          update((value) =>
            value.denied && value.historyLoaded && value.entries.length === 0
              ? value
              : { ...value, entries: [], denied: true, historyLoaded: true },
          );
        }),
      );
      update((value) => (value.denied ? { ...value, denied: false } : value));
      // Coalesce snapshot requests while retaining one catch-up behind an active request.
      const historyRequests = yield* Queue.sliding<undefined>(1);
      const flushRequests = yield* Queue.dropping<undefined>(1);
      const loadHistory = Effect.gen(function* () {
        yield* Queue.take(historyRequests);
        const result = yield* Effect.result(logs.history);
        if (result._tag === "Failure") {
          if (isAccessDenied(result.failure)) {
            yield* deny;
            return;
          }
          yield* Effect.logWarning(
            "Could not load previous logs",
            result.failure,
          );
          update((value) =>
            value.historyLoaded ? value : { ...value, historyLoaded: true },
          );
          return;
        }
        yield* flush;
        update((value) => {
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
      // A refused history request also ends the retry loop.
      const retrying = () => !denied;
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
  ).pipe(Effect.provide(terminalLogsLayer(client, scope)));
}

export interface TerminalLogAtoms {
  /** The cached logs of a scope. They stay for a while after the last view closes. */
  readonly state: Atom.Atom<TerminalLogState>;
  /** Follows the scope while mounted. Unmounting stops the stream right away. */
  readonly session: Atom.Atom<AsyncResult.AsyncResult<void>>;
}

function terminalLogFamilies(client: LogClient) {
  // The family holds atoms weakly. The session atom and the registry node of
  // a cached state atom keep it alive, so a view that opens again within
  // IDLE_RETENTION finds the logs it showed before.
  const state = Atom.family((_scopeKey: string) =>
    Atom.make(emptyTerminalLogState).pipe(Atom.setIdleTTL(IDLE_RETENTION)),
  );
  const session = Atom.family((scopeKey: string) => {
    const stateAtom = state(scopeKey);
    return Atom.make((get) => {
      get.mount(stateAtom);
      return followTerminalLogs(
        client,
        fromJsonString(LogScopeSchema, scopeKey),
        (f) => {
          get.registry.update(stateAtom, f);
        },
      );
    }).pipe(Atom.setIdleTTL(0));
  });
  return { state, session };
}

const families = new WeakMap<
  Transport,
  ReturnType<typeof terminalLogFamilies>
>();

// Demo mode has no transport, so its logs stay empty and never load.
const demoAtoms: TerminalLogAtoms = {
  state: Atom.make(emptyTerminalLogState),
  session: Atom.make(Effect.void),
};

/**
 * Returns the atoms for the logs of a scope on a connection. Views of the
 * same connection and scope share one stream.
 */
export function terminalLogAtoms(
  transport: Transport | null,
  scope: LogScope,
): TerminalLogAtoms {
  if (!transport) return demoAtoms;
  let family = families.get(transport);
  if (!family) {
    family = terminalLogFamilies(createRpcClient(LogsService, transport));
    families.set(transport, family);
  }
  const scopeKey = toJsonString(LogScopeSchema, scope);
  return { state: family.state(scopeKey), session: family.session(scopeKey) };
}

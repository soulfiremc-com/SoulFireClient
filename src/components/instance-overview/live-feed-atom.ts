import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import { Effect, Queue, Schedule, Schema, Stream } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import {
  type InstanceEvent,
  InstanceLiveService,
} from "@/generated/soulfire/instance_live_pb";
import { createRpcClient } from "@/lib/rpc";
import { timestampToDate } from "@/lib/utils.tsx";
import { addFeedEntry, type FeedEntry } from "./live-feed-buffer.ts";

const MAX_FEED_ENTRIES = 200;
const RETRY_AFTER_ERROR_MS = 3000;
const RETRY_AFTER_END_MS = 1000;

export interface LiveFeedState {
  readonly entries: readonly FeedEntry[];
  /** Set while the feed waits to reconnect, until the next event arrives. */
  readonly reconnecting: boolean;
}

const emptyFeed: LiveFeedState = { entries: [], reconnecting: false };

/** Marks a feed stream that the server closed without an error. */
const FEED_ENDED = Symbol("feed ended");

/** Emitted before each wait to reconnect. */
const RECONNECTING = Symbol("reconnecting");

/**
 * Follows a stream of events and opens it again after it ends: 1 second
 * after the server closes it and 3 seconds after an error. A stream the
 * server cancels ends the feed.
 */
function reconnectingEvents<A>(
  open: () => Stream.Stream<A, ConnectError>,
): Stream.Stream<A | typeof RECONNECTING> {
  return Stream.suspend(open).pipe(
    Stream.concat(Stream.fail(FEED_ENDED)),
    Stream.catch(
      (
        error: ConnectError | typeof FEED_ENDED,
      ): Stream.Stream<typeof RECONNECTING, ConnectError | typeof FEED_ENDED> =>
        error instanceof ConnectError && error.code === Code.Canceled
          ? Stream.empty
          : Stream.make(RECONNECTING).pipe(Stream.concat(Stream.fail(error))),
    ),
    Stream.retry(
      Schedule.spaced(RETRY_AFTER_END_MS).pipe(
        Schedule.modifyDelay(({ input }) =>
          Effect.succeed(
            input === FEED_ENDED ? RETRY_AFTER_END_MS : RETRY_AFTER_ERROR_MS,
          ),
        ),
      ),
    ),
    // The schedule never gives up, so no failure is left.
    Stream.orDie,
  );
}

function feedEntry(event: InstanceEvent, id: number): FeedEntry | undefined {
  const value = event.event;
  if (value.case === "chat")
    return {
      id,
      botNames: [event.botName],
      timestamp: value.value.receivedAt
        ? timestampToDate(value.value.receivedAt)
        : new Date(),
      kind: "chat",
      senderName: value.value.senderName,
      text: value.value.plainText,
    };
  if (value.case === "lifecycle")
    return {
      id,
      botNames: [event.botName],
      timestamp: new Date(),
      kind: "lifecycle",
      lifecycleKind: value.value.kind,
      message: value.value.message,
    };
  return undefined;
}

/**
 * Collects the chat and lifecycle events of an instance, or of one bot. The
 * buffer changes with each event, and the state is published at most once
 * per animation frame, so a chat line that reaches 1000 bots causes one
 * render.
 */
function liveFeed(
  transport: Transport,
  instanceId: string,
  botName: string | undefined,
): Stream.Stream<LiveFeedState> {
  const client = createRpcClient(InstanceLiveService, transport);
  return Stream.callback<LiveFeedState>(
    (queue) =>
      Effect.gen(function* () {
        const buffer: FeedEntry[] = [];
        let nextId = 0;
        let reconnecting = false;
        let frame: number | undefined;
        const publish = () => {
          frame ??= requestAnimationFrame(() => {
            frame = undefined;
            Queue.offerUnsafe(queue, { entries: [...buffer], reconnecting });
          });
        };
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            if (frame !== undefined) cancelAnimationFrame(frame);
          }),
        );
        yield* reconnectingEvents(() =>
          client.watchInstanceEvents({
            instanceId,
            filter: { includeChat: true, includeLifecycle: true },
          }),
        ).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event === RECONNECTING) {
                reconnecting = true;
                publish();
                return;
              }
              const wasReconnecting = reconnecting;
              reconnecting = false;
              const entry =
                botName === undefined || event.botName === botName
                  ? feedEntry(event, nextId)
                  : undefined;
              if (entry) {
                nextId++;
                addFeedEntry(buffer, entry, MAX_FEED_ENTRIES);
              }
              if (entry || wasReconnecting) publish();
            }),
          ),
        );
      }),
    // Each state holds the whole feed, so only the newest one matters.
    { bufferSize: 1, strategy: "sliding" },
  );
}

const decodeFeedKey = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      instanceId: Schema.String,
      botName: Schema.optional(Schema.String),
    }),
  ),
);
const idleFeedAtom = Atom.make(emptyFeed);
const feedFamilies = new WeakMap<
  Transport,
  (key: string) => Atom.Atom<LiveFeedState>
>();

/**
 * Returns the live feed of an instance, or of one bot on it. The feed runs
 * while a component reads it and stops at once when the last one unmounts.
 */
export function liveFeedAtom(
  transport: Transport | null,
  instanceId: string,
  botName: string | undefined,
): Atom.Atom<LiveFeedState> {
  if (!transport) return idleFeedAtom;
  let family = feedFamilies.get(transport);
  if (!family) {
    // The key is a JSON string, so the same feed reuses its running stream.
    family = Atom.family((key: string) => {
      const feed = decodeFeedKey(key);
      const events = Atom.make(
        liveFeed(transport, feed.instanceId, feed.botName),
        {
          initialValue: emptyFeed,
        },
      ).pipe(Atom.setIdleTTL(0));
      return Atom.make((get) =>
        AsyncResult.getOrElse(get(events), () => emptyFeed),
      ).pipe(Atom.setIdleTTL(0));
    });
    feedFamilies.set(transport, family);
  }
  return family(JSON.stringify({ instanceId, botName }));
}

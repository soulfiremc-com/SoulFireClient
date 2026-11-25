import { Code, type ConnectError, type Transport } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import {
  Console,
  Duration,
  Effect,
  Fiber,
  Schedule,
  type Scope,
  Stream,
} from "effect";
import { Atom } from "effect/reactivity";
import { type BotListResponse, BotService } from "@/generated/soulfire/bot_pb";
import { reconcileBotStatuses } from "./bot-status-cache.ts";
import { createRpcClient } from "./rpc.ts";

/** Marks a status stream that the server closed without an error. */
const STREAM_ENDED = Symbol("stream ended");

/**
 * Waits 1 second before the first reconnect and doubles the wait up to 30
 * seconds. A status event resets it.
 */
const reconnectSchedule = Schedule.exponential("1 second").pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.seconds(30))),
  ),
);

function watchBotStatuses(
  transport: Transport,
  queryClient: QueryClient,
  instanceId: string,
) {
  return Effect.gen(function* () {
    const client = createRpcClient(BotService, transport);
    let refreshFiber: Fiber.Fiber<void> | undefined;
    let fleetChanged = false;
    // Status events keep the bot list fresh. Instance info and the
    // instance list already poll for fleet counts, so they only refresh
    // here when bots join or leave the fleet, or after a reconnect.
    const refresh = (fleet: boolean) =>
      Effect.gen(function* () {
        fleetChanged ||= fleet;
        if (refreshFiber) return;
        // Coalesce fleet events without postponing refreshes under sustained load.
        refreshFiber = yield* Effect.sleep("250 millis").pipe(
          Effect.andThen(
            Effect.sync(() => {
              refreshFiber = undefined;
              const queryKeys: unknown[][] = [
                ["bot-status", instanceId],
                ["bot-info", instanceId],
              ];
              if (fleetChanged) {
                queryKeys.push(
                  ["instance-info", instanceId],
                  ["instance-list"],
                );
              }
              fleetChanged = false;
              for (const queryKey of queryKeys) {
                void queryClient.invalidateQueries(
                  { queryKey },
                  { cancelRefetch: false },
                );
              }
            }),
          ),
          Effect.forkScoped,
        );
      });
    const settle = Effect.suspend(() =>
      refreshFiber ? Fiber.join(refreshFiber) : Effect.void,
    );

    yield* Stream.suspend(() => client.watchBotStatuses({ instanceId })).pipe(
      Stream.tap((event) =>
        Effect.gen(function* () {
          const value = event.event;
          if (value.case === undefined) return;
          const known = queryClient.getQueryData<BotListResponse>([
            "bot-status",
            instanceId,
          ]);
          // An update for a bot the list does not have yet means it joined.
          const membershipChanged =
            value.case !== "update" ||
            (known !== undefined &&
              !known.bots.some(
                (bot) => bot.profileId === value.value.profileId,
              ));
          queryClient.setQueryData<BotListResponse>(
            ["bot-status", instanceId],
            (current) =>
              reconcileBotStatuses(
                current,
                value.case === "snapshot"
                  ? value.value.bots
                  : value.case === "update"
                    ? [value.value]
                    : [],
                value.case === "snapshot",
                value.case === "removedBotId" ? value.value : undefined,
              ),
          );
          yield* refresh(membershipChanged);
        }),
      ),
      Stream.concat(Stream.fail(STREAM_ENDED)),
      Stream.catch(
        (
          error: ConnectError | typeof STREAM_ENDED,
        ): Stream.Stream<
          never,
          ConnectError | typeof STREAM_ENDED,
          Scope.Scope
        > => {
          if (error === STREAM_ENDED)
            return Stream.fromEffectDrain(refresh(true)).pipe(
              Stream.concat(Stream.fail(error)),
            );
          // A deleted instance has no statuses to watch.
          if (error.code === Code.NotFound)
            return Stream.fromEffectDrain(refresh(true));
          // Retrying cannot fix these, so the watch stops.
          if (
            [
              Code.PermissionDenied,
              Code.Unauthenticated,
              Code.Unimplemented,
            ].includes(error.code)
          )
            return Stream.fromEffectDrain(
              Console.error("Bot status stream ended", error),
            );
          return Stream.fromEffectDrain(
            Effect.andThen(
              Console.error("Bot status stream ended", error),
              refresh(true),
            ),
          ).pipe(Stream.concat(Stream.fail(error)));
        },
      ),
      Stream.retry(reconnectSchedule),
      Stream.runDrain,
    );
    yield* settle;
  });
}

const NO_TRANSPORT = Atom.make(undefined);
const watchFamilies = new WeakMap<
  Transport,
  WeakMap<QueryClient, (instanceId: string) => Atom.Atom<unknown>>
>();

/**
 * Keeps the bot status cache of an instance current while mounted. It
 * reconnects after a dropped stream and stops at once on unmount.
 */
export function botStatusWatchAtom(
  transport: Transport | null,
  queryClient: QueryClient,
  instanceId: string,
): Atom.Atom<unknown> {
  if (!transport) return NO_TRANSPORT;
  let clients = watchFamilies.get(transport);
  if (!clients) {
    clients = new WeakMap();
    watchFamilies.set(transport, clients);
  }
  let family = clients.get(queryClient);
  if (!family) {
    family = Atom.family((id: string) =>
      Atom.make(watchBotStatuses(transport, queryClient, id)).pipe(
        Atom.setIdleTTL(0),
      ),
    );
    clients.set(queryClient, family);
  }
  return family(instanceId);
}

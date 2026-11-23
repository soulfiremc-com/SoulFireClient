import { Code, type Transport } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { Console, Effect, Fiber, Result, Stream } from "effect";
import { type BotListResponse, BotService } from "@/generated/soulfire/bot_pb";
import { reconcileBotStatuses } from "./bot-status-cache.ts";
import { createRpcClient } from "./rpc.ts";

export function watchBotStatuses(
  transport: Transport,
  queryClient: QueryClient,
  instanceId: string,
) {
  const fiber = Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const client = createRpcClient(BotService, transport);
        let refreshFiber: Fiber.Fiber<void> | undefined;
        let fleetChanged = false;
        let retryDelay = 1000;
        // Status events keep the bot list fresh. Instance info and the
        // instance list already poll for fleet counts, so they only refresh
        // here when bots join or leave the fleet, or after a reconnect.
        const refresh = (fleet: boolean) =>
          Effect.gen(function* () {
            fleetChanged ||= fleet;
            if (refreshFiber) return;
            // Coalesce fleet events without postponing refreshes under sustained load.
            refreshFiber = yield* Effect.forkIn(
              Effect.sleep("250 millis").pipe(
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
              ),
              scope,
            );
          });

        while (true) {
          const result = yield* Effect.result(
            client.watchBotStatuses({ instanceId }).pipe(
              // oxlint-disable-next-line eslint/no-loop-func -- the stream finishes inside this iteration and resets the retry delay for the next one
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  retryDelay = 1000;
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
            ),
          );
          if (Result.isFailure(result)) {
            const error = result.failure;
            if (error.code === Code.NotFound) {
              yield* refresh(true);
              if (refreshFiber) yield* Fiber.join(refreshFiber);
              return;
            }
            yield* Console.error("Bot status stream ended", error);
            if (
              [
                Code.PermissionDenied,
                Code.Unauthenticated,
                Code.Unimplemented,
              ].includes(error.code)
            ) {
              if (refreshFiber) yield* Fiber.join(refreshFiber);
              return;
            }
          }
          yield* refresh(true);
          yield* Effect.sleep(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      }),
    ),
  );
  return () => {
    Effect.runFork(Fiber.interrupt(fiber));
  };
}

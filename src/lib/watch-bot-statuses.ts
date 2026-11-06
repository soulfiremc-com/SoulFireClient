import {
  Code,
  ConnectError,
  createClient,
  type Transport,
} from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { Effect, Fiber, Result, Stream } from "effect";
import { type BotListResponse, BotService } from "@/generated/soulfire/bot_pb";
import { reconcileBotStatuses } from "./bot-status-cache.ts";

export function watchBotStatuses(
  transport: Transport,
  queryClient: QueryClient,
  instanceId: string,
) {
  const fiber = Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const client = createClient(BotService, transport);
        let refreshFiber: Fiber.Fiber<void> | undefined;
        let retryDelay = 1_000;
        const refresh = Effect.gen(function* () {
          if (refreshFiber) return;
          // Coalesce fleet events without postponing refreshes under sustained load.
          refreshFiber = yield* Effect.forkIn(
            Effect.sleep("250 millis").pipe(
              Effect.andThen(
                Effect.sync(() => {
                  refreshFiber = undefined;
                  for (const queryKey of [
                    ["bot-status", instanceId],
                    ["bot-info", instanceId],
                    ["instance-info", instanceId],
                    ["instance-list"],
                  ]) {
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
            Effect.scoped(
              Effect.gen(function* () {
                const controller = yield* Effect.acquireRelease(
                  Effect.sync(() => new AbortController()),
                  (controller) => Effect.sync(() => controller.abort()),
                );
                yield* Stream.fromAsyncIterable(
                  client.watchBotStatuses(
                    { instanceId },
                    { signal: controller.signal },
                  ),
                  ConnectError.from,
                ).pipe(
                  Stream.runForEach((event) =>
                    Effect.gen(function* () {
                      retryDelay = 1_000;
                      const value = event.event;
                      if (value.case === undefined) return;
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
                            value.case === "removedBotId"
                              ? value.value
                              : undefined,
                          ),
                      );
                      yield* refresh;
                    }),
                  ),
                );
              }),
            ),
          );
          if (Result.isFailure(result)) {
            const error = result.failure;
            if (error.code === Code.NotFound) {
              yield* refresh;
              if (refreshFiber) yield* Fiber.join(refreshFiber);
              return;
            }
            console.error("Bot status stream ended", error);
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
          yield* refresh;
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

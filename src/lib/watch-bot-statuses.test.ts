import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import {
  type BotListResponse,
  BotListResponseSchema,
  BotRuntimeState,
  BotService,
} from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import { QueryClient } from "@tanstack/react-query";
import { watchBotStatuses } from "./watch-bot-statuses.ts";

test("stream reconnects after EOF, refreshes details, and stops on cleanup", async () => {
  let subscriptions = 0;
  const transport = createRouterTransport((router) => {
    router.service(BotService, {
      async *watchBotStatuses() {
        subscriptions++;
        yield {
          event: {
            case: "update",
            value: {
              profileId: "bot",
              runtimeState: BotRuntimeState.RUNNING,
            },
          },
        };
      },
    });
  });
  const cache = new QueryClient();
  const botKey = ["bot-status", "instance"];
  cache.setQueryData(
    botKey,
    create(BotListResponseSchema, {
      bots: [{ profileId: "bot", isOnline: false }],
    }),
  );
  cache.setQueryData(["instance-list"], { instances: [] });
  const stop = watchBotStatuses(transport, cache, "instance");
  try {
    await delay(1300);
    assert.equal(subscriptions, 2);
    const bots = cache.getQueryData<BotListResponse>(botKey);
    assert.equal(bots?.bots[0].status?.runtimeState, BotRuntimeState.RUNNING);
    assert.equal(bots?.bots[0].isOnline, false);
    assert.equal(cache.getQueryState(botKey)?.isInvalidated, true);
    assert.equal(cache.getQueryState(["instance-list"])?.isInvalidated, true);
    stop();
    await delay(1100);
    assert.equal(subscriptions, 2);
  } finally {
    stop();
    cache.clear();
  }
});

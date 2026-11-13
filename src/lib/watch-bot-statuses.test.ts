import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { QueryClient } from "@tanstack/react-query";
import {
  type BotListResponse,
  BotListResponseSchema,
  BotRuntimeState,
  BotService,
} from "@/generated/soulfire/bot_pb";
import { watchBotStatuses } from "./watch-bot-statuses.ts";

const instanceId = "instance";

test("a deleted instance refreshes its profile without reopening the status stream", async () => {
  const client = new QueryClient();
  const key = ["instance-info", instanceId];
  client.setQueryData(key, { id: instanceId });
  let attempts = 0;
  const transport = createRouterTransport((router) => {
    router.service(BotService, {
      watchBotStatuses() {
        attempts++;
        throw new ConnectError("", Code.NotFound);
      },
    });
  });
  const stop = watchBotStatuses(transport, client, instanceId);
  try {
    await delay(1_200);
    assert.equal(attempts, 1);
    assert.equal(client.getQueryState(key)?.isInvalidated, true);
  } finally {
    stop();
    client.clear();
  }
});

test("a transient failure reconnects and teardown cancels the live stream", async () => {
  const client = new QueryClient();
  let attempts = 0;
  let ended = false;
  const running = () =>
    client.getQueryData<BotListResponse>(["bot-status", instanceId])?.bots[0]
      ?.status?.runtimeState === BotRuntimeState.RUNNING;
  client.setQueryData(
    ["bot-status", instanceId],
    create(BotListResponseSchema, { bots: [{ profileId: "bot" }] }),
  );
  const transport = createRouterTransport((router) => {
    router.service(BotService, {
      async *watchBotStatuses(_request, context) {
        attempts++;
        if (attempts === 1) throw new ConnectError("", Code.Unavailable);
        try {
          yield {
            event: {
              case: "snapshot",
              value: {
                bots: [
                  { profileId: "bot", runtimeState: BotRuntimeState.RUNNING },
                ],
              },
            },
          };
          await new Promise<void>((resolve) => {
            if (context.signal.aborted) resolve();
            else
              context.signal.addEventListener("abort", () => resolve(), {
                once: true,
              });
          });
        } finally {
          ended = true;
        }
      },
    });
  });
  const stop = watchBotStatuses(transport, client, instanceId);
  try {
    const deadline = Date.now() + 3_000;
    while (!running() && Date.now() < deadline) await delay(10);
    assert.equal(attempts, 2);
    assert.equal(
      client.getQueryData<BotListResponse>(["bot-status", instanceId])?.bots[0]
        .profileId,
      "bot",
    );
    stop();
    await delay(1_200);
    assert.equal(ended, true);
    assert.equal(attempts, 2);
  } finally {
    stop();
    client.clear();
  }
});

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

test("cleanup cancels a pending fleet refresh as well as the live stream", async () => {
  const cache = new QueryClient();
  const key = ["instance-info", instanceId];
  cache.setQueryData(key, { id: instanceId });
  let updated = false;
  let ended = false;
  const transport = createRouterTransport((router) => {
    router.service(BotService, {
      async *watchBotStatuses(_request, context) {
        try {
          yield { event: { case: "removedBotId", value: "bot" } };
          updated = true;
          await new Promise<void>((resolve) => {
            if (context.signal.aborted) resolve();
            else
              context.signal.addEventListener("abort", () => resolve(), {
                once: true,
              });
          });
        } finally {
          ended = true;
        }
      },
    });
  });
  const stop = watchBotStatuses(transport, cache, instanceId);
  try {
    const deadline = Date.now() + 1000;
    while (!updated && Date.now() < deadline) await delay(1);
    assert.equal(updated, true);
    stop();
    await delay(350);
    assert.equal(cache.getQueryState(key)?.isInvalidated, false);
    assert.equal(ended, true);
  } finally {
    stop();
    cache.clear();
  }
});

test("permission and unsupported-stream failures never reconnect", async () => {
  const stops: (() => void)[] = [];
  const cache = new QueryClient();
  const attempts = new Map<Code, number>();
  try {
    for (const code of [
      Code.Unauthenticated,
      Code.PermissionDenied,
      Code.Unimplemented,
    ]) {
      const transport = createRouterTransport((router) => {
        router.service(BotService, {
          watchBotStatuses() {
            attempts.set(code, (attempts.get(code) ?? 0) + 1);
            throw new ConnectError("Unavailable", code);
          },
        });
      });
      stops.push(watchBotStatuses(transport, cache, instanceId));
    }
    await delay(1150);
    for (const count of attempts.values()) assert.equal(count, 1);
    assert.equal(attempts.size, 3);
  } finally {
    for (const stop of stops) stop();
    cache.clear();
  }
});

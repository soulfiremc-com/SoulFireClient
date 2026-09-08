import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  BotListResponseSchema,
  BotRuntimeState,
  BotStatusSchema,
} from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import { reconcileBotStatuses } from "./bot-status-cache.ts";

test("snapshots remove absent bots and preserve live data for known bots", () => {
  const current = create(BotListResponseSchema, {
    bots: [{ profileId: "a", isOnline: true, pingMs: 42 }, { profileId: "b" }],
  });
  const status = create(BotStatusSchema, {
    profileId: "a",
    runtimeState: BotRuntimeState.RUNNING,
  });
  const result = reconcileBotStatuses(current, [status], true);
  assert.equal(result?.bots.length, 1);
  assert.equal(result?.bots[0].pingMs, 42);
  assert.equal(result?.bots[0].isOnline, true);
  assert.deepEqual(result?.bots[0].status, status);
  assert.equal(current.bots.length, 2);
});

test("delayed updates cannot overwrite a newer polled status", () => {
  const current = create(BotListResponseSchema, {
    bots: [
      {
        profileId: "a",
        status: {
          profileId: "a",
          runtimeState: BotRuntimeState.RUNNING,
          updatedAt: { seconds: 10n, nanos: 2 },
        },
      },
    ],
  });
  const older = create(BotStatusSchema, {
    profileId: "a",
    runtimeState: BotRuntimeState.STARTING,
    updatedAt: { seconds: 10n, nanos: 1 },
  });
  assert.deepEqual(reconcileBotStatuses(current, [older], false), current);
});

test("partial updates retain unrelated bots and do not invent connection details", () => {
  const current = create(BotListResponseSchema, {
    bots: [{ profileId: "a" }, { profileId: "b" }],
  });
  const update = create(BotStatusSchema, {
    profileId: "a",
    runtimeState: BotRuntimeState.RUNNING,
  });
  const result = reconcileBotStatuses(current, [update], false);
  assert.equal(result?.bots.length, 2);
  assert.equal(result?.bots[0].isOnline, false);
  assert.equal(reconcileBotStatuses(current, [], true)?.bots.length, 0);
  assert.equal(reconcileBotStatuses(current, [], false, "b")?.bots.length, 1);
  assert.equal(reconcileBotStatuses(undefined, [update], true), undefined);
});

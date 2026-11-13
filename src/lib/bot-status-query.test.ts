import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { QueryClient } from "@tanstack/react-query";
import {
  BotDesiredState,
  BotListResponseSchema,
  BotRuntimeState,
  BotStatusSchema,
} from "@/generated/soulfire/bot_pb";
import { reconcileBotStatuses, shareBotListData } from "./bot-status-cache.ts";

test("an in-flight list cannot roll back a streamed lifecycle change", async () => {
  const client = new QueryClient();
  const options = {
    queryKey: ["bot-status", "instance"],
    structuralSharing: shareBotListData,
  };
  const before = create(BotListResponseSchema, {
    bots: [
      {
        profileId: "bot",
        isOnline: true,
        pingMs: 10,
        status: {
          profileId: "bot",
          desiredState: BotDesiredState.RUNNING,
          runtimeState: BotRuntimeState.RUNNING,
          updatedAt: { seconds: 5n, nanos: 0 },
        },
      },
    ],
  });
  const stopped = create(BotStatusSchema, {
    profileId: "bot",
    desiredState: BotDesiredState.STOPPED,
    runtimeState: BotRuntimeState.STOPPED,
    updatedAt: { seconds: 5n, nanos: 1 },
  });
  let complete!: (value: typeof before) => void;
  const response = new Promise<typeof before>((resolve) => {
    complete = resolve;
  });
  client.setQueryData(options.queryKey, before);
  try {
    const pending = client.fetchQuery({
      ...options,
      queryFn: () => response,
    });
    client.setQueryData<typeof before>(options.queryKey, (current) =>
      reconcileBotStatuses(current, [stopped], false),
    );
    complete(before);
    await pending;
    const result = client.getQueryData<typeof before>(options.queryKey);
    assert.deepEqual(result?.bots[0].status, stopped);
    assert.equal(result?.bots[0].isOnline, false);
    assert.equal(result?.bots[0].pingMs, undefined);

    const fresh = create(BotListResponseSchema, {
      bots: [
        {
          profileId: "bot",
          isOnline: true,
          status: create(BotStatusSchema, {
            profileId: "bot",
            desiredState: BotDesiredState.RUNNING,
            runtimeState: BotRuntimeState.RUNNING,
            updatedAt: { seconds: 6n, nanos: 0 },
          }),
          pingMs: 12,
        },
        { profileId: "new-bot" },
      ],
    });
    await client.fetchQuery({ ...options, queryFn: async () => fresh });
    assert.deepEqual(client.getQueryData(options.queryKey), fresh);
  } finally {
    client.clear();
  }
});

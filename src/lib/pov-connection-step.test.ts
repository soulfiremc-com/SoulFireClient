import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  BotConnectionInfoSchema,
  BotDesiredState,
  BotInfoResponseSchema,
  BotLiveStateSchema,
  BotRuntimeState,
  BotStatusSchema,
} from "@/generated/soulfire/bot_pb";
import { getPovConnectionStep } from "./pov-connection-step.ts";

function bot(
  runtimeState: BotRuntimeState,
  extra: {
    desired?: BotDesiredState;
    connected?: boolean;
    live?: boolean;
  } = {},
) {
  return create(BotInfoResponseSchema, {
    status: create(BotStatusSchema, {
      runtimeState,
      desiredState: extra.desired ?? BotDesiredState.RUNNING,
    }),
    connection: extra.connected ? create(BotConnectionInfoSchema) : undefined,
    liveState: extra.live ? create(BotLiveStateSchema) : undefined,
  });
}

test("follows a bot from Start to a live view", () => {
  assert.equal(getPovConnectionStep(bot(BotRuntimeState.QUEUED)), "queued");
  assert.equal(getPovConnectionStep(bot(BotRuntimeState.STARTING)), "starting");
  assert.equal(
    getPovConnectionStep(bot(BotRuntimeState.STARTING, { connected: true })),
    "joining",
  );
  assert.equal(getPovConnectionStep(bot(BotRuntimeState.RUNNING)), "joining");
  assert.equal(
    getPovConnectionStep(bot(BotRuntimeState.RUNNING, { live: true })),
    "online",
  );
});

test("treats a requested start as starting before the server reports it", () => {
  assert.equal(getPovConnectionStep(bot(BotRuntimeState.STOPPED)), "starting");
  assert.equal(
    getPovConnectionStep(
      bot(BotRuntimeState.STOPPED, { desired: BotDesiredState.STOPPED }),
    ),
    "stopped",
  );
});

test("reports failures, retries, and stops", () => {
  assert.equal(getPovConnectionStep(bot(BotRuntimeState.FAILED)), "failed");
  assert.equal(getPovConnectionStep(bot(BotRuntimeState.RETRYING)), "retrying");
  assert.equal(
    getPovConnectionStep(bot(BotRuntimeState.STOPPING, { live: true })),
    "stopping",
  );
});

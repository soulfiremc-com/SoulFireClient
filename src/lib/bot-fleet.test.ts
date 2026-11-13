import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  BotConnectionPhase,
  BotDesiredState,
  BotListEntrySchema,
  BotRuntimeState,
} from "@/generated/soulfire/bot_pb";
import {
  classifyBotFailure,
  countBotFleet,
  getBotDisplayState,
  groupBotFailures,
  selectBotsToStart,
} from "./bot-fleet.ts";

function bot(
  id: string,
  runtimeState: BotRuntimeState,
  options: {
    online?: boolean;
    desired?: BotDesiredState;
    error?: string;
    phase?: BotConnectionPhase;
  } = {},
) {
  return create(BotListEntrySchema, {
    profileId: id,
    accountName: `Bot ${id}`,
    isOnline: options.online ?? false,
    connectionPhase: options.phase ?? BotConnectionPhase.DISCONNECTED,
    status: {
      profileId: id,
      desiredState: options.desired ?? BotDesiredState.RUNNING,
      runtimeState,
      lastError: options.error,
    },
  });
}

test("a bot that should run is not reported as connected until it is online", () => {
  assert.equal(
    getBotDisplayState(bot("a", BotRuntimeState.RUNNING)),
    "starting",
  );
  assert.equal(
    getBotDisplayState(bot("a", BotRuntimeState.RUNNING, { online: true })),
    "connected",
  );
});

test("maps runtime states to what the user sees", () => {
  assert.equal(
    getBotDisplayState(bot("a", BotRuntimeState.RETRYING)),
    "retrying",
  );
  assert.equal(getBotDisplayState(bot("a", BotRuntimeState.FAILED)), "failed");
  assert.equal(
    getBotDisplayState(bot("a", BotRuntimeState.STOPPING)),
    "stopping",
  );
  assert.equal(
    getBotDisplayState(
      bot("a", BotRuntimeState.STOPPED, { desired: BotDesiredState.STOPPED }),
    ),
    "stopped",
  );
  assert.equal(getBotDisplayState(undefined), "stopped");
});

test("counts desired bots separately from connected bots", () => {
  const counts = countBotFleet([
    bot("a", BotRuntimeState.RUNNING, { online: true }),
    bot("b", BotRuntimeState.RETRYING),
    bot("c", BotRuntimeState.FAILED),
    bot("d", BotRuntimeState.STOPPED, { desired: BotDesiredState.STOPPED }),
  ]);
  assert.equal(counts.total, 4);
  assert.equal(counts.desired, 3);
  assert.equal(counts.connected, 1);
  assert.equal(counts.retrying, 1);
  assert.equal(counts.failed, 1);
  assert.equal(counts.stopped, 1);
});

test("groups the same cause across bots and puts failures first", () => {
  const groups = groupBotFailures([
    bot("a", BotRuntimeState.RETRYING, { error: "Connection throttled!" }),
    bot("b", BotRuntimeState.RETRYING, { error: "Connection throttled!" }),
    bot("c", BotRuntimeState.FAILED, { error: "Connection refused: a:25565" }),
    bot("d", BotRuntimeState.FAILED, { error: "Connection refused: a:25566" }),
    bot("e", BotRuntimeState.RUNNING, { online: true }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.severity, "failed");
  assert.deepEqual(groups[0]?.botIds, ["c", "d"]);
  assert.equal(groups[0]?.kind, "unreachable");
  assert.equal(groups[1]?.kind, "throttled");
});

test("keeps failed bots visible when the server gives no error", () => {
  const [group] = groupBotFailures([bot("a", BotRuntimeState.FAILED)]);
  assert.equal(group?.message, "");
  assert.equal(group?.kind, "other");
  assert.deepEqual(group?.botIds, ["a"]);
});

test("classifies failures only when the message supports it", () => {
  assert.equal(classifyBotFailure("Invalid session"), "account");
  assert.equal(
    classifyBotFailure("Outdated client! Please use 1.21"),
    "version",
  );
  assert.equal(classifyBotFailure("SOCKS5 handshake failed"), "proxy");
  assert.equal(classifyBotFailure("Something unusual happened"), "other");
});

test("starts only stopped bots and respects the requested count", () => {
  const bots = [
    bot("a", BotRuntimeState.RUNNING, { online: true }),
    bot("b", BotRuntimeState.STOPPED, { desired: BotDesiredState.STOPPED }),
    bot("c", BotRuntimeState.STOPPED, { desired: BotDesiredState.STOPPED }),
  ];
  assert.deepEqual(selectBotsToStart(bots, undefined, false), ["b", "c"]);
  assert.deepEqual(selectBotsToStart(bots, 1, false), ["b"]);
  assert.deepEqual(
    selectBotsToStart(bots, 2, true, () => 0),
    ["c", "b"],
  );
});

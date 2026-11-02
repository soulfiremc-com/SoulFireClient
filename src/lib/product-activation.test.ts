import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { BotConnectionPhase } from "@/generated/soulfire/bot_pb";
import { getAnalyticsIdentity } from "./analytics-identity";
import {
  createProductActivationTracker,
  watchProductActivation,
} from "./product-activation";

const spawned = {
  isOnline: true,
  connectionPhase: BotConnectionPhase.SPAWNED,
};

test("activation requires a connected, spawned bot and an authenticated user", () => {
  const events: { event: string; properties: object }[] = [];
  const tracker = createProductActivationTracker({
    surface: "desktop",
    now: () => new Date("2026-11-01T12:00:00Z"),
    capture: (event, properties) => {
      events.push({ event, properties });
      return true;
    },
  });
  assert.equal(tracker.observe("", [spawned]), false);
  assert.equal(tracker.observe("user", []), false);
  assert.equal(
    tracker.observe("user", [
      { isOnline: true, connectionPhase: BotConnectionPhase.CONNECTING },
      { ...spawned, isOnline: false },
    ]),
    false,
  );
  assert.deepEqual(events, []);
  assert.equal(tracker.observe("user", [spawned]), true);
  assert.deepEqual(events, [
    {
      event: "product_session_started",
      properties: {
        client_surface: "desktop",
        measurement_version: 1,
        $set_once: { product_first_session_at: "2026-11-01T12:00:00.000Z" },
      },
    },
    {
      event: "product_activated",
      properties: {
        client_surface: "desktop",
        measurement_version: 1,
        activation: "first_bot_spawned",
        $set_once: { product_activated_at: "2026-11-01T12:00:00.000Z" },
      },
    },
  ]);
  assert.equal(tracker.observe("user", [spawned]), false);
  assert.equal(tracker.start("user"), true);
  assert.equal(events.length, 2);
});

test("activation deduplicates across reloads per user and retries rejected capture", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => void saved.set(key, value),
  };
  let enabled = false;
  const events: string[] = [];
  const makeTracker = () =>
    createProductActivationTracker({
      surface: "web",
      storage,
      capture: (event) => {
        if (!enabled) return false;
        events.push(event);
        return true;
      },
    });
  const tracker = makeTracker();
  assert.equal(tracker.observe("first-user", [spawned]), false);
  assert.equal(saved.size, 0);
  enabled = true;
  assert.equal(tracker.observe("first-user", [spawned]), true);
  assert.equal(makeTracker().observe("first-user", [spawned]), false);
  assert.equal(makeTracker().observe("second-user", [spawned]), true);
  assert.equal(
    events.filter((event) => event === "product_activated").length,
    2,
  );
});

test("storage failures preserve activation and in-memory deduplication", () => {
  let captures = 0;
  const tracker = createProductActivationTracker({
    surface: "web",
    storage: {
      getItem: () => {
        throw new Error("Storage blocked");
      },
      setItem: () => {
        throw new Error("Storage blocked");
      },
    },
    capture: () => {
      captures++;
      return true;
    },
  });
  assert.equal(tracker.observe("user", [spawned]), true);
  assert.equal(tracker.observe("user", [spawned]), false);
  assert.equal(captures, 2);
});

test("root activation is independent per installation and ignores legacy deduplication", () => {
  const root = "00000000-0000-0000-0000-000000000000";
  const saved = new Map([[`soulfire-product-activated-v1:${root}`, "1"]]);
  let activations = 0;
  const tracker = createProductActivationTracker({
    surface: "desktop",
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => void saved.set(key, value),
    },
    capture: (event) => {
      if (event === "product_activated") activations++;
      return true;
    },
  });
  const first = getAnalyticsIdentity(
    "00000000-0000-4000-8000-000000000001",
    root,
  )!;
  const second = getAnalyticsIdentity(
    "00000000-0000-4000-8000-000000000002",
    root,
  )!;
  assert.equal(tracker.observe(first, [spawned]), true);
  assert.equal(tracker.observe(first, [spawned]), false);
  assert.equal(tracker.observe(second, [spawned]), true);
  assert.equal(activations, 2);
});

test("fresh bot-status results activate once and unsubscribe stops observation", () => {
  const queryClient = new QueryClient();
  const events: string[] = [];
  const tracker = createProductActivationTracker({
    surface: "web",
    capture: (event) => {
      events.push(event);
      return true;
    },
  });
  queryClient.setQueryData(["bot-status", "old-instance"], { bots: [spawned] });
  const unsubscribe = watchProductActivation(queryClient, "user", tracker);
  assert.deepEqual(events, []);
  queryClient.setQueryData(["instance-list"], { bots: [spawned] });
  queryClient.setQueryData(["bot-status", "instance"], {
    bots: [{ ...spawned, connectionPhase: BotConnectionPhase.CONNECTING }],
  });
  assert.deepEqual(events, []);
  queryClient.setQueryData(["bot-status", "instance"], { bots: [spawned] });
  queryClient.setQueryData(["bot-status", "instance"], { bots: [spawned] });
  assert.deepEqual(events, ["product_session_started", "product_activated"]);
  unsubscribe();
  const otherEvents: string[] = [];
  const stop = watchProductActivation(
    queryClient,
    "other-user",
    createProductActivationTracker({
      surface: "web",
      capture: (event) => {
        otherEvents.push(event);
        return true;
      },
    }),
  );
  stop();
  queryClient.setQueryData(["bot-status", "instance"], { bots: [spawned] });
  assert.deepEqual(otherEvents, []);
  queryClient.clear();
});

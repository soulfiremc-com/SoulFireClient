import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { BotConnectionPhase } from "@/generated/soulfire/bot_pb";
import {
  createSupportReminder,
  SUPPORT_REMINDER_KEY,
  watchSupportReminderBots,
} from "./support-reminder";

const DAY = 24 * 60 * 60 * 1000;
const FIRST_USE = Date.UTC(2026, 0, 1, 12);
const spawned = { isOnline: true, connectionPhase: BotConnectionPhase.SPAWNED };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  } satisfies Storage;
}

function fixture(storage = memoryStorage()) {
  let timestamp = FIRST_USE;
  const makeReminder = () =>
    createSupportReminder({ storage, now: () => timestamp });
  const reminder = makeReminder();
  return {
    storage,
    reminder,
    makeReminder,
    at: (value: number) => {
      timestamp = value;
    },
    qualify: () => {
      for (const day of [0, 1, 14]) {
        timestamp = FIRST_USE + day * DAY;
        reminder.recordUse();
      }
      reminder.observeBots([spawned]);
    },
  };
}

test("first use needs fourteen days, three distinct active days, and a successful spawn", () => {
  const { reminder, at } = fixture();
  assert.equal(reminder.isEligible(), false);
  reminder.recordUse();
  reminder.recordUse();
  assert.equal(reminder.getSnapshot().activeDays.length, 1);
  reminder.observeBots([
    { ...spawned, isOnline: false },
    { isOnline: true, connectionPhase: BotConnectionPhase.CONNECTING },
  ]);
  at(FIRST_USE + DAY);
  reminder.recordUse();
  at(FIRST_USE + 2 * DAY);
  reminder.recordUse();
  assert.equal(reminder.isEligible(), false);
  at(FIRST_USE + 14 * DAY);
  assert.equal(reminder.isEligible(), false);
  reminder.observeBots([spawned]);
  at(FIRST_USE + 14 * DAY - 1);
  assert.equal(reminder.isEligible(), false);
  at(FIRST_USE + 14 * DAY);
  assert.equal(reminder.isEligible(), true);
  at(FIRST_USE + 30 * DAY);
  reminder.recordUse();
  assert.equal(reminder.getSnapshot().activeDays.length, 3);
});

test("elapsed time and background bot polling do not substitute for active days", () => {
  const { reminder, at } = fixture();
  reminder.recordUse();
  reminder.observeBots([spawned]);
  at(FIRST_USE + 100 * DAY);
  for (let index = 0; index < 10; index++) reminder.observeBots([spawned]);
  assert.equal(reminder.isEligible(), false);
  assert.equal(reminder.getSnapshot().activeDays.length, 1);
});

test("eligibility survives reloads and does not store user or bot identifiers", () => {
  const f = fixture();
  f.qualify();
  assert.equal(f.makeReminder().isEligible(), true);
  assert.deepEqual(JSON.parse(f.storage.getItem(SUPPORT_REMINDER_KEY)!), {
    firstUsedAt: FIRST_USE,
    activeDays: ["2026-01-01", "2026-01-02", "2026-01-15"],
    hasSpawnedBot: true,
    lastShownAt: null,
    disabled: null,
  });
});

test("an impression starts the six-month cooldown even if the user ignores it", () => {
  const f = fixture();
  f.qualify();
  assert.equal(f.reminder.markShown(), true);
  assert.equal(f.reminder.markShown(), false);
  const secondTab = f.makeReminder();
  assert.equal(secondTab.isEligible(), false);
  f.at(Date.UTC(2026, 6, 15, 12) - 1);
  assert.equal(secondTab.isEligible(), false);
  f.at(Date.UTC(2026, 6, 15, 12));
  assert.equal(secondTab.isEligible(), true);
});

test("later and opening support snooze without marking the user as a supporter", () => {
  const f = fixture();
  f.qualify();
  f.reminder.dismiss("later");
  assert.equal(f.reminder.getSnapshot().disabled, null);
  f.at(Date.UTC(2026, 6, 15, 12));
  assert.equal(f.makeReminder().isEligible(), true);
});

test("six months clamps to the final day of the target month", () => {
  const f = fixture();
  f.qualify();
  f.at(Date.UTC(2026, 7, 31, 12));
  assert.equal(f.reminder.markShown(), true);
  f.at(Date.UTC(2027, 1, 28, 12) - 1);
  assert.equal(f.reminder.isEligible(), false);
  f.at(Date.UTC(2027, 1, 28, 12));
  assert.equal(f.reminder.isEligible(), true);
});

for (const reason of ["never", "supporter"] as const) {
  test(`${reason} permanently disables automatic reminders across reloads`, () => {
    const f = fixture();
    f.qualify();
    f.reminder.dismiss(reason);
    f.at(FIRST_USE + 1000 * DAY);
    const reloaded = f.makeReminder();
    assert.equal(reloaded.isEligible(), false);
    assert.equal(reloaded.markShown(), false);
    const saved = f.storage.getItem(SUPPORT_REMINDER_KEY);
    reloaded.recordUse();
    reloaded.observeBots([spawned]);
    assert.equal(f.storage.getItem(SUPPORT_REMINDER_KEY), saved);
  });
}

test("another tab cannot show a recently claimed or disabled reminder", () => {
  const f = fixture();
  f.qualify();
  const secondTab = f.makeReminder();
  assert.equal(secondTab.isEligible(), true);
  assert.equal(f.reminder.markShown(), true);
  assert.equal(secondTab.markShown(), false);
  f.reminder.dismiss("supporter");
  secondTab.synchronize();
  assert.equal(secondTab.getSnapshot().disabled, "supporter");
});

test("an older tab cannot undo a permanent opt-out by snoozing", () => {
  const f = fixture();
  f.qualify();
  const olderTab = f.makeReminder();
  f.reminder.dismiss("never");
  olderTab.dismiss("later");
  assert.equal(f.makeReminder().getSnapshot().disabled, "never");
});

test("old dismissals retain a six-month cooldown without bypassing the new eligibility criteria", () => {
  const storage = memoryStorage();
  storage.setItem("sf-support-dismissed-at", String(FIRST_USE));
  const f = fixture(storage);
  assert.equal(f.reminder.isEligible(), false);
  f.qualify();
  assert.equal(f.reminder.isEligible(), false);
  f.at(Date.UTC(2026, 6, 1, 12));
  assert.equal(f.makeReminder().isEligible(), true);
});

test("malformed state and unavailable storage do not interrupt the app or trigger an early request", () => {
  for (const saved of ["{", "null", "[]", '{"firstUsedAt":"yesterday"}']) {
    const storage = memoryStorage();
    storage.setItem(SUPPORT_REMINDER_KEY, saved);
    const reminder = createSupportReminder({ storage, now: () => FIRST_USE });
    reminder.recordUse();
    assert.equal(reminder.isEligible(), false);
  }
  const storage = memoryStorage();
  storage.getItem = () => {
    throw new Error("Storage blocked");
  };
  storage.setItem = () => {
    throw new Error("Storage blocked");
  };
  const reminder = createSupportReminder({ storage });
  assert.doesNotThrow(() => {
    reminder.recordUse();
    reminder.observeBots([spawned]);
    reminder.dismiss("never");
  });
  assert.equal(reminder.isEligible(), false);
});

test("spawn observation requires a fresh bot-status result and stops when the session ends", () => {
  const f = fixture();
  const client = new QueryClient();
  client.setQueryData(["bot-status", "cached"], { bots: [spawned] });
  const stop = watchSupportReminderBots(client, f.reminder);
  assert.equal(f.reminder.getSnapshot().hasSpawnedBot, false);
  client.setQueryData(["other"], { bots: [spawned] });
  assert.equal(f.reminder.getSnapshot().hasSpawnedBot, false);
  client.setQueryData(["bot-status", "live"], {
    bots: [{ ...spawned, isOnline: false }],
  });
  assert.equal(f.reminder.getSnapshot().hasSpawnedBot, false);
  client.setQueryData(["bot-status", "live"], { bots: [spawned] });
  assert.equal(f.reminder.getSnapshot().hasSpawnedBot, true);
  stop();
  const next = fixture();
  const unwatch = watchSupportReminderBots(client, next.reminder);
  unwatch();
  client.setQueryData(["bot-status", "next"], { bots: [spawned] });
  assert.equal(next.reminder.getSnapshot().hasSpawnedBot, false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { BotLifecycleKind } from "@/generated/soulfire/bot_live_pb";
import { addFeedEntry, type FeedEntry } from "./live-feed-buffer.ts";

let nextId = 0;
function chat(bot: string, text: string, at = 0): FeedEntry {
  return {
    id: nextId++,
    botNames: [bot],
    timestamp: new Date(at),
    kind: "chat",
    senderName: "Server",
    text,
  };
}

test("one chat line received by many bots shows once with every bot", () => {
  const buffer: FeedEntry[] = [];
  for (const bot of ["a", "b", "c"]) {
    addFeedEntry(buffer, chat(bot, "Welcome!", 100), 200);
  }
  assert.equal(buffer.length, 1);
  assert.deepEqual(buffer[0]?.botNames, ["a", "b", "c"]);
});

test("the same bot repeating a line and later repeats stay separate", () => {
  const buffer: FeedEntry[] = [];
  addFeedEntry(buffer, chat("a", "hi", 0), 200);
  addFeedEntry(buffer, chat("a", "hi", 10), 200);
  addFeedEntry(buffer, chat("b", "hi", 60_000), 200);
  assert.equal(buffer.length, 3);
});

test("lifecycle events are never merged, and the buffer keeps the newest entries", () => {
  const buffer: FeedEntry[] = [];
  for (const bot of ["a", "b", "c"]) {
    addFeedEntry(
      buffer,
      {
        id: nextId++,
        botNames: [bot],
        timestamp: new Date(0),
        kind: "lifecycle",
        lifecycleKind: BotLifecycleKind.BOT_LIFECYCLE_CONNECTED,
      },
      2,
    );
  }
  assert.deepEqual(
    buffer.map((entry) => entry.botNames[0]),
    ["b", "c"],
  );
});

test("a merged entry is a new object so memoized rows update", () => {
  const buffer: FeedEntry[] = [];
  addFeedEntry(buffer, chat("a", "x"), 200);
  const first = buffer[0];
  addFeedEntry(buffer, chat("b", "x"), 200);
  assert.notEqual(buffer[0], first);
  assert.equal(first?.botNames.length, 1);
});

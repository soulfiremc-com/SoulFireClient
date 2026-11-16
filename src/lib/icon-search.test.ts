import assert from "node:assert/strict";
import { test } from "node:test";
import { searchIcons, type IconTagEntry } from "./icon-search";

const entries: IconTagEntry[] = [
  ["arrow-down", ["direction"]],
  ["bot", ["robot", "ai"]],
  ["bot-message-square", ["chat"]],
  ["robot-arm", []],
  ["square", ["shape"]],
];

test("empty query returns the first icons and the full count", () => {
  assert.deepEqual(searchIcons(entries, "  ", 2), {
    names: ["arrow-down", "bot"],
    total: 5,
  });
});

test("exact and prefix name matches rank before name and tag matches", () => {
  assert.deepEqual(searchIcons(entries, "bot", 10).names, [
    "bot",
    "bot-message-square",
    "robot-arm",
  ]);
  assert.deepEqual(searchIcons(entries, "robot", 10).names, [
    "robot-arm",
    "bot",
  ]);
});

test("spaces match dashed names and results respect the limit", () => {
  assert.deepEqual(searchIcons(entries, "Message Square", 10).names, [
    "bot-message-square",
  ]);
  assert.deepEqual(searchIcons(entries, "o", 1), {
    names: ["arrow-down"],
    total: 4,
  });
});

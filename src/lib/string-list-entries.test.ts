import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createStringListEntry,
  reconcileStringListEntries,
} from "./string-list-entries.ts";

const entries = (...values: string[]) => values.map(createStringListEntry);

test("list echoes preserve every row and the current array", () => {
  const previous = entries("alpha", "beta");
  assert.equal(
    reconcileStringListEntries(previous, ["alpha", "beta"]),
    previous,
  );
});

test("replacing text preserves the edited row identity", () => {
  const previous = entries("alpha", "beta");
  const updated = reconcileStringListEntries(previous, ["edited", "beta"]);
  assert.equal(updated[0].id, previous[0].id);
  assert.equal(updated[0].value, "edited");
  assert.equal(updated[1], previous[1]);
});

test("insertion and removal preserve the identities of unchanged rows", () => {
  const previous = entries("alpha", "beta", "gamma");
  const inserted = reconcileStringListEntries(previous, [
    "new",
    "alpha",
    "beta",
    "gamma",
  ]);
  assert.deepEqual(inserted.slice(1), previous);
  assert.ok(!previous.some((entry) => entry.id === inserted[0].id));
  const removed = reconcileStringListEntries(inserted, ["alpha", "gamma"]);
  assert.deepEqual(removed, [previous[0], previous[2]]);
});

test("reordering moves existing rows instead of replacing them", () => {
  const previous = entries("alpha", "beta", "gamma");
  assert.deepEqual(
    reconcileStringListEntries(previous, ["gamma", "alpha", "beta"]),
    [previous[2], previous[0], previous[1]],
  );
});

test("duplicate and empty values retain distinct identities", () => {
  const previous = entries("", "duplicate", "duplicate");
  const updated = reconcileStringListEntries(previous, [
    "duplicate",
    "",
    "duplicate",
    "duplicate",
  ]);
  assert.deepEqual(updated.slice(0, 3), [
    previous[1],
    previous[0],
    previous[2],
  ]);
  assert.equal(new Set(updated.map((entry) => entry.id)).size, 4);
  assert.deepEqual(reconcileStringListEntries(updated, []), []);
});

test("replacing a row with a duplicate does not move the unchanged row", () => {
  const previous = entries("alpha", "beta");
  const updated = reconcileStringListEntries(previous, ["beta", "beta"]);
  assert.equal(updated[1], previous[1]);
  assert.equal(updated[0].id, previous[0].id);
});

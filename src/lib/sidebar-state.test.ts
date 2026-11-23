import assert from "node:assert/strict";
import { test } from "node:test";
import { readSidebarOpen, writeSidebarOpen } from "./sidebar-state";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("reads null before the user chooses a sidebar state", () => {
  assert.equal(readSidebarOpen(memoryStorage()), null);
});

test("reads back the saved sidebar state", () => {
  const storage = memoryStorage();
  writeSidebarOpen(storage, false);
  assert.equal(readSidebarOpen(storage), false);
  writeSidebarOpen(storage, true);
  assert.equal(readSidebarOpen(storage), true);
});

test("ignores storage that throws", () => {
  const blocked = {
    getItem: (): string | null => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readSidebarOpen(blocked), null);
  assert.doesNotThrow(() => {
    writeSidebarOpen(blocked, true);
  });
});

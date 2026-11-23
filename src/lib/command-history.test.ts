import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMAND_HISTORY_KEY,
  appendCommandHistory,
  clearCommandHistory,
  commandHistoryKey,
  navigateCommandHistory,
  readCommandHistory,
  saveCommandHistory,
  type CommandHistoryPosition,
} from "./command-history";

const read = (value: string | null) =>
  readCommandHistory(COMMAND_HISTORY_KEY, { getItem: () => value });

const token = (payload: object) =>
  `header.${btoa(JSON.stringify(payload)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")}.signature`;

function memoryStorage(values: Record<string, string>) {
  const map = new Map(Object.entries(values));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

const key = (values: Record<string, string>) =>
  commandHistoryKey(memoryStorage(values));

test("each user on each server gets a separate history", () => {
  const alice = token({ sub: "alice-id" });
  const bob = token({ sub: "bob-id" });
  const aliceHere = key({
    "server-address": "https://a",
    "server-token": alice,
  });
  assert.notEqual(
    aliceHere,
    key({ "server-address": "https://b", "server-token": alice }),
  );
  assert.notEqual(
    aliceHere,
    key({ "server-address": "https://a", "server-token": bob }),
  );
  // A new sign-in issues a new token for the same user.
  assert.equal(
    aliceHere,
    key({
      "server-address": "https://a",
      "server-token": token({ sub: "alice-id", iat: 2 }),
    }),
  );
  // Impersonation uses the history of the impersonated user.
  assert.equal(
    key({
      "server-address": "https://a",
      "server-token": alice,
      "server-impersonation-token": bob,
    }),
    key({ "server-address": "https://a", "server-token": bob }),
  );
  // The key never contains the token itself.
  assert.ok(!aliceHere.includes(alice));
  for (const values of [
    {},
    { "server-address": "https://a" },
    { "server-address": "https://a", "server-token": "not-a-jwt" },
    { "server-address": "https://a", "server-token": token({}) },
  ])
    assert.equal(key(values), COMMAND_HISTORY_KEY);
});

test("clearing removes the history of every user and keeps other data", () => {
  const storage = memoryStorage({
    [COMMAND_HISTORY_KEY]: "[]",
    [`${COMMAND_HISTORY_KEY}:alice@https://a`]: "[]",
    [`${COMMAND_HISTORY_KEY}:bob@https://b`]: "[]",
    "sf-command-history-settings": "keep",
    "server-address": "https://a",
  });
  clearCommandHistory(storage);
  assert.deepEqual(storage.keys(), [
    "sf-command-history-settings",
    "server-address",
  ]);
});

test("history loading tolerates corruption while retaining valid entries", () => {
  for (const value of [null, "{", "null", "{}"])
    assert.deepEqual(read(value), []);
  assert.deepEqual(
    read(JSON.stringify([null, 17, "1", {}, "", "  ", "2"])).map(Number),
    [1, 2],
  );
});

test("loading and appending retain the latest hundred entries without mutation", () => {
  const history = read(
    JSON.stringify(Array.from({ length: 120 }, (_, i) => String(i))),
  );
  const next = appendCommandHistory(history, "120");
  assert.deepEqual(
    history.map(Number),
    Array.from({ length: 100 }, (_, i) => i + 20),
  );
  assert.deepEqual(
    next.map(Number),
    Array.from({ length: 100 }, (_, i) => i + 21),
  );
  assert.equal(appendCommandHistory(next, "120"), next);
});

test("storage failures do not prevent keeping history in memory", () => {
  assert.deepEqual(
    readCommandHistory(COMMAND_HISTORY_KEY, {
      getItem: () => {
        throw new Error("Test failure");
      },
    }),
    [],
  );
  const history = appendCommandHistory([], "1");
  assert.doesNotThrow(() => {
    saveCommandHistory(COMMAND_HISTORY_KEY, history, {
      setItem: () => {
        throw new Error("Test failure");
      },
    });
  });
  assert.deepEqual(history.map(Number), [1]);
});

test("history traversal restores the unsent draft and respects both boundaries", () => {
  const history = ["1", "2", "3"];
  let position: CommandHistoryPosition = { index: -1, draft: "" };
  let value = "4";
  const step = (direction: -1 | 1) => {
    const next = navigateCommandHistory(history, position, value, direction);
    if (next) {
      position = next.position;
      value = next.value;
    }
    return next;
  };
  assert.equal(step(1), undefined);
  for (const expected of [3, 2, 1]) {
    step(-1);
    assert.equal(Number(value), expected);
  }
  assert.equal(step(-1), undefined);
  for (const expected of [2, 3, 4]) {
    step(1);
    assert.equal(Number(value), expected);
  }
  assert.equal(position.index, -1);
  assert.equal(step(1), undefined);
  assert.equal(navigateCommandHistory([], position, value, -1), undefined);
});

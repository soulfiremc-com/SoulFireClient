import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendCommandHistory,
  navigateCommandHistory,
  readCommandHistory,
  saveCommandHistory,
  type CommandHistoryPosition,
} from "./command-history";

const read = (value: string | null) =>
  readCommandHistory({ getItem: () => value });

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
    readCommandHistory({
      getItem: () => {
        throw new Error();
      },
    }),
    [],
  );
  const history = appendCommandHistory([], "1");
  assert.doesNotThrow(() =>
    saveCommandHistory(history, {
      setItem: () => {
        throw new Error();
      },
    }),
  );
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

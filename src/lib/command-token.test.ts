import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommandTokenRange } from "./command-token";

for (const text of [
  'instance "QA Alpha" help',
  "instance 'QA Alpha' help",
  'instance "QA \\"Alpha\\"" help',
  'instance "QA \\\\Alpha" help',
]) {
  test(`completion replaces the entire quoted argument in ${text}`, () => {
    const end = text.indexOf(" help");
    for (let cursor = 10; cursor <= end; cursor++) {
      const range = getCommandTokenRange(text, cursor);
      assert.deepEqual(range, { start: 9, end });
      assert.equal(
        `${text.slice(0, range.start)}"Replacement"${text.slice(range.end)}`,
        'instance "Replacement" help',
      );
    }
  });
}

test("completion replaces an unfinished quoted argument across spaces", () => {
  const text = 'instance "QA Alpha';
  assert.deepEqual(getCommandTokenRange(text, text.length), {
    start: 9,
    end: text.length,
  });
});

test("plain token completion preserves suffixes and quoted earlier arguments", () => {
  assert.deepEqual(getCommandTokenRange("movXYZ tail", 3), {
    start: 0,
    end: 6,
  });
  assert.deepEqual(getCommandTokenRange('instance "QA Alpha" heXYZ tail', 22), {
    start: 20,
    end: 25,
  });
});

test("completion in separators or after an empty command inserts at the caret", () => {
  assert.deepEqual(getCommandTokenRange("", 0), { start: 0, end: 0 });
  assert.deepEqual(getCommandTokenRange("instance   help", 10), {
    start: 10,
    end: 10,
  });
  assert.deepEqual(getCommandTokenRange('instance "QA Alpha" ', 20), {
    start: 20,
    end: 20,
  });
});

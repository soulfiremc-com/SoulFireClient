import assert from "node:assert/strict";
import { test } from "node:test";
import { editBoxValue } from "./minecraft-edit-box";

const text = (...codes: number[]) => String.fromCodePoint(...codes);
const points = (value: string) =>
  Array.from(value, (character) => character.codePointAt(0)!);

test("filters native disallowed characters before spending the length budget", () => {
  assert.deepEqual(
    points(editBoxValue(text(0, 9, 10, 13, 31, 127, 167, 65, 66, 67), 2)),
    [65, 66],
  );
});

test("preserves complete supplementary characters at the UTF-16 boundary", () => {
  const value = text(0x96ea, 0x1f642, 0x754c);
  assert.deepEqual(points(editBoxValue(value, 1)), [0x96ea]);
  assert.deepEqual(points(editBoxValue(value, 2)), [0x96ea]);
  assert.deepEqual(points(editBoxValue(value, 3)), [0x96ea, 0x1f642]);
  assert.deepEqual(points(editBoxValue(value, 4)), [0x96ea, 0x1f642, 0x754c]);
});

test("keeps unbounded fields valid and rejects isolated surrogate input", () => {
  assert.deepEqual(
    points(editBoxValue(text(65, 0xd800, 66, 0xdc00, 0x1f642), 0)),
    [65, 66, 0x1f642],
  );
});

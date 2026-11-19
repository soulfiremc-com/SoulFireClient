import assert from "node:assert/strict";
import { test } from "node:test";
import { editBoxInsertion, editBoxValue } from "./minecraft-edit-box";
import { assertDefined } from "@/lib/assert-defined";

const text = (...codes: number[]) => String.fromCodePoint(...codes);
const points = (value: string) =>
  Array.from(value, (character) =>
    assertDefined(
      character.codePointAt(0),
      "Expected character.codePointAt(0) to exist",
    ),
  );

test("filters native disallowed characters before spending the length budget", () => {
  assert.deepEqual(
    points(editBoxValue(text(0, 9, 10, 13, 31, 127, 167, 65, 66, 67), 2)),
    [65, 66],
  );
});

test("preserves complete supplementary characters at the UTF-16 boundary", () => {
  const value = text(0x96_ea, 0x1_f6_42, 0x75_4c);
  assert.deepEqual(points(editBoxValue(value, 1)), [0x96_ea]);
  assert.deepEqual(points(editBoxValue(value, 2)), [0x96_ea]);
  assert.deepEqual(points(editBoxValue(value, 3)), [0x96_ea, 0x1_f6_42]);
  assert.deepEqual(
    points(editBoxValue(value, 4)),
    [0x96_ea, 0x1_f6_42, 0x75_4c],
  );
});

test("keeps unbounded fields valid and rejects isolated surrogate input", () => {
  assert.deepEqual(
    points(editBoxValue(text(65, 0xd8_00, 66, 0xdc_00, 0x1_f6_42), 0)),
    [65, 66, 0x1_f6_42],
  );
});

test("limits inserted text to the space released by the current selection", () => {
  const original = text(...Array.from({ length: 48 }, () => 65), 90);
  assert.deepEqual(
    points(editBoxInsertion(original, text(0x1_f6_42), 10, 10, 50)),
    [],
  );
  assert.deepEqual(
    points(
      editBoxInsertion(original, text(167, 0x1_f6_42, 65, 66), 10, 12, 50),
    ),
    [0x1_f6_42, 65],
  );
  assert.deepEqual(
    points(editBoxInsertion(original, text(65), 10, 10, 49)),
    [],
  );
  assert.deepEqual(
    points(editBoxInsertion(original, text(167, 65, 66), 10, 10, 0)),
    [65, 66],
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getNumericSettingValue,
  updateNumericRange,
} from "./numeric-setting-value.ts";

test("numeric drafts can reach valid multi-digit values without persisting invalid prefixes", () => {
  const saved = ["", "1", "16"]
    .map((draft) => getNumericSettingValue(draft, 2, 32, true))
    .filter((value) => value !== undefined);
  assert.deepEqual(saved, [16]);
  const negative = ["", "-", "-1"]
    .map((draft) => getNumericSettingValue(draft, -1, 100, true))
    .filter((value) => value !== undefined);
  assert.deepEqual(negative, [-1]);
});

test("empty and incomplete drafts never become zero or a truncated number", () => {
  for (const draft of ["", "-", ".", "-.", " ", "2x", "1e2", "2.5"]) {
    assert.equal(getNumericSettingValue(draft, -100, 100, true), undefined);
  }
  assert.equal(getNumericSettingValue("0", -100, 100, true), 0);
});

test("decimal drafts retain their precision and respect inclusive bounds", () => {
  for (const [draft, expected] of [
    [".25", 0.25],
    ["0.", 0],
    ["1.", 1],
    ["-0.5", -0.5],
  ] as const) {
    assert.equal(getNumericSettingValue(draft, -0.5, 1, false), expected);
  }
  assert.equal(getNumericSettingValue("1.01", -0.5, 1, false), undefined);
  assert.equal(getNumericSettingValue("-0.51", -0.5, 1, false), undefined);
});

test("numeric server values preserve large numbers and reject non-finite or fractional integers", () => {
  assert.equal(getNumericSettingValue(1e21, 0, Number.MAX_VALUE, false), 1e21);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      getNumericSettingValue(value, -Number.MAX_VALUE, Number.MAX_VALUE, false),
      undefined,
    );
  }
  assert.equal(getNumericSettingValue(1.5, 0, 10, true), undefined);
  assert.equal(getNumericSettingValue(-1, -1, 10, true), -1);
  assert.equal(getNumericSettingValue(10, -1, 10, true), 10);
});

test("maximum prefixes do not permanently lower the minimum", () => {
  const baseline = { min: 4500, max: 4500 };
  const edits = [2, 25, 250, 2500].map((value) =>
    updateNumericRange(baseline, "max", value),
  );
  assert.deepEqual(edits[edits.length - 1], { min: 2500, max: 2500 });
  assert.deepEqual(baseline, { min: 4500, max: 4500 });
});

test("correcting an overshoot restores the opposite bound from the edit baseline", () => {
  const baseline = { min: 1000, max: 3000 };
  assert.deepEqual(updateNumericRange(baseline, "min", 45000), {
    min: 45000,
    max: 45000,
  });
  assert.deepEqual(updateNumericRange(baseline, "min", 4500), {
    min: 4500,
    max: 4500,
  });
  assert.deepEqual(updateNumericRange(baseline, "min", 1500), {
    min: 1500,
    max: 3000,
  });
});

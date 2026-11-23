import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSettingDefaultValue,
  isSameSettingValue,
} from "./setting-default-value.ts";

test("string list defaults can be reset and are copied", () => {
  const def = ["Hello", "World"];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
  const value = getSettingDefaultValue({
    type: { case: "stringList", value: { def } },
  } as never);
  assert.deepEqual(value, ["Hello", "World"]);
  assert.notEqual(value, def);
});

test("scalar defaults are returned unchanged", () => {
  assert.equal(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
    getSettingDefaultValue({
      type: { case: "int", value: { def: 5 } },
    } as never),
    5,
  );
});

test("min/max ranges reset to both entry defaults", () => {
  assert.deepEqual(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
    getSettingDefaultValue({
      type: {
        case: "minMax",
        value: { minEntry: { def: 2 }, maxEntry: { def: 5 } },
      },
    } as never),
    { min: 2, max: 5 },
  );
  assert.equal(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
    getSettingDefaultValue({ type: { case: "minMax", value: {} } } as never),
    undefined,
  );
});

test("ranges compare by both bounds", () => {
  assert.equal(
    isSameSettingValue({ min: 2, max: 5 }, { min: 2, max: 5 }),
    true,
  );
  assert.equal(
    isSameSettingValue({ min: 2, max: 5 }, { min: 2, max: 6 }),
    false,
  );
});

test("lists with the same items match the default", () => {
  assert.equal(isSameSettingValue(["a", "b"], ["a", "b"]), true);
  assert.equal(isSameSettingValue(["a", "b"], ["b", "a"]), false);
  assert.equal(isSameSettingValue(["a"], ["a", "b"]), false);
  assert.equal(isSameSettingValue([], []), true);
});

test("scalars compare by value", () => {
  assert.equal(isSameSettingValue(3, 3), true);
  assert.equal(isSameSettingValue("3", 3), false);
});

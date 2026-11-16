import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSettingDefaultValue,
  isSameSettingValue,
} from "./setting-default-value.ts";

test("string list defaults can be reset and are copied", () => {
  const def = ["Hello", "World"];
  const value = getSettingDefaultValue({
    type: { case: "stringList", value: { def } },
  } as never);
  assert.deepEqual(value, ["Hello", "World"]);
  assert.notEqual(value, def);
});

test("scalar defaults are returned unchanged", () => {
  assert.equal(
    getSettingDefaultValue({
      type: { case: "int", value: { def: 5 } },
    } as never),
    5,
  );
});

test("min/max ranges have no single default", () => {
  assert.equal(
    getSettingDefaultValue({ type: { case: "minMax", value: {} } } as never),
    undefined,
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

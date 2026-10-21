import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonToValue, parseJsonValue, valueToJson } from "./protobuf.ts";

test("metadata parsing preserves null and other false-like values through protobuf", () => {
  for (const value of [null, false, 0, "", { value: null, items: [null] }]) {
    const parsed = parseJsonValue(JSON.stringify(value));
    assert.ok(parsed !== undefined);
    assert.deepEqual(valueToJson(jsonToValue(parsed)), value);
  }
});

test("invalid metadata JSON cannot become a stored null", () => {
  for (const input of ["", "undefined", "{", "null trailing"]) {
    assert.equal(parseJsonValue(input), undefined);
  }
});

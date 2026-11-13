import assert from "node:assert/strict";
import { test } from "node:test";
import type { PortType } from "@/components/script-editor/nodes/types";
import { valueToJson } from "./protobuf";
import { InvalidMockInput, parseMockInputs } from "./script-dry-run";

test("mock inputs preserve text, numbers, booleans, and omitted defaults", () => {
  const parsed = parseMockInputs(
    [
      { id: "text", type: "string" },
      { id: "count", type: "number" },
      { id: "enabled", type: "boolean" },
      { id: "default", type: "number" },
    ],
    { text: "  123  ", count: "2.5", enabled: "false", default: " " },
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, valueToJson(value)]),
    ),
    {
      text: "  123  ",
      count: 2.5,
      enabled: false,
    },
  );
});

test("structured mocks round-trip nested values and nulls", () => {
  const input = { nested: [1, null, { enabled: true }] };
  const parsed = parseMockInputs([{ id: "value", type: "map" }], {
    value: JSON.stringify(input),
  });
  assert.deepEqual(valueToJson(parsed.value), input);
  const vector = parseMockInputs([{ id: "value", type: "vector3" }], {
    value: '{"x":1,"y":2,"z":3}',
  });
  assert.deepEqual(valueToJson(vector.value), { x: 1, y: 2, z: 3 });
});

test("invalid typed mocks identify the field that needs correction", () => {
  const invalid: Array<[PortType, string]> = [
    ["number", "true"],
    ["number", "1e999"],
    ["number", "no"],
    ["boolean", '"false"'],
    ["list", "{}"],
    ["set", "null"],
    ["collection", "1"],
    ["map", "[]"],
    ["map", "null"],
    ["vector3", '{"x":1,"y":2}'],
    ["vector3", '{"x":1,"y":2,"z":"3"}'],
    ["any", "{"],
  ];
  for (const [type, value] of invalid) {
    assert.throws(
      () => parseMockInputs([{ id: "value", type }], { value }),
      (error) => error instanceof InvalidMockInput && error.portId === "value",
    );
  }
});

test("collection and any mocks retain arrays and explicit null", () => {
  for (const type of ["list", "set", "collection"] as const) {
    const parsed = parseMockInputs([{ id: "value", type }], { value: "[1,2]" });
    assert.deepEqual(valueToJson(parsed.value), [1, 2]);
  }
  const parsed = parseMockInputs([{ id: "value", type: "any" }], {
    value: "null",
  });
  assert.equal(valueToJson(parsed.value), null);
});

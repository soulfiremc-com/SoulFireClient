import assert from "node:assert/strict";
import { test } from "node:test";
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import {
  type SettingsDefinition,
  SettingsDefinitionSchema,
} from "@/generated/soulfire/common_pb";
import { getSettingValue } from "./utils.tsx";

type DefinitionInit = Exclude<
  MessageInitShape<typeof SettingsDefinitionSchema>,
  SettingsDefinition
>;

function definition(type: NonNullable<DefinitionInit["type"]>) {
  return create(SettingsDefinitionSchema, {
    id: { namespace: "bot", key: "value" },
    type,
  });
}

const definitions = {
  string: definition({ case: "string", value: { def: "default" } }),
  int: definition({ case: "int", value: { def: 5 } }),
  double: definition({ case: "double", value: { def: 0.25 } }),
  bool: definition({ case: "bool", value: { def: true } }),
  combo: definition({ case: "combo", value: { def: "second" } }),
  stringList: definition({ case: "stringList", value: { def: ["a", "b"] } }),
  minMax: definition({
    case: "minMax",
    value: { minEntry: { def: 1000 }, maxEntry: { def: 3000 } },
  }),
};

test("each setting type falls back to its default when no value is stored", () => {
  const empty = { settings: {} };
  assert.equal(getSettingValue(empty, definitions.string), "default");
  assert.equal(getSettingValue(empty, definitions.int), 5);
  assert.equal(getSettingValue(empty, definitions.double), 0.25);
  assert.equal(getSettingValue(empty, definitions.bool), true);
  assert.equal(getSettingValue(empty, definitions.combo), "second");
  assert.deepEqual(getSettingValue(empty, definitions.stringList), ["a", "b"]);
  assert.deepEqual(getSettingValue(empty, definitions.minMax), {
    min: 1000,
    max: 3000,
  });
});

test("a stored value wins over the default, including falsy values", () => {
  for (const stored of ["", 0, false, null, [], { min: 0, max: 0 }]) {
    const config = { settings: { bot: { value: stored } } };
    for (const item of Object.values(definitions)) {
      assert.deepEqual(getSettingValue(config, item), stored);
    }
  }
});

test("a min-max setting without entry defaults reads as null bounds", () => {
  const item = definition({ case: "minMax", value: {} });
  assert.deepEqual(getSettingValue({ settings: {} }, item), {
    min: null,
    max: null,
  });
});

test("definitions without an id or type have no value", () => {
  const config = { settings: { bot: { value: "stored" } } };
  assert.equal(getSettingValue(config, undefined), null);
  assert.equal(
    getSettingValue(
      config,
      create(SettingsDefinitionSchema, {
        type: { case: "string", value: { def: "default" } },
      }),
    ),
    null,
  );
  assert.equal(getSettingValue(config, definition({ case: undefined })), null);
});

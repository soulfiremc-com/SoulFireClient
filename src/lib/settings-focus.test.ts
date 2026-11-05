import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { SettingsDefinitionSchema } from "@/generated/soulfire/common_pb";
import {
  getSettingLabel,
  isFocusedSetting,
  parseSettingFocusSearch,
} from "./settings-focus";

test("setting deep links require a bounded namespace and key together", () => {
  assert.deepEqual(
    parseSettingFocusSearch({
      focusNamespace: "bot",
      focusKey: "read-timeout",
      ignored: true,
    }),
    { focusNamespace: "bot", focusKey: "read-timeout" },
  );
  for (const search of [
    {},
    { focusNamespace: "bot" },
    { focusNamespace: ["bot"], focusKey: "timeout" },
    { focusNamespace: "bot", focusKey: "" },
    { focusNamespace: "bot", focusKey: "x".repeat(257) },
  ])
    assert.deepEqual(parseSettingFocusSearch(search), {});
  assert.equal(
    isFocusedSetting(
      { namespace: "bot", key: "timeout" },
      { namespace: "proxy", key: "timeout" },
    ),
    false,
  );
  assert.equal(
    isFocusedSetting({ namespace: "bot", key: "timeout" }, undefined),
    false,
  );
  assert.equal(
    isFocusedSetting(
      { namespace: "bot", key: "timeout" },
      { namespace: "bot", key: "timeout" },
    ),
    true,
  );
});

test("setting labels retain both labels of a numeric range and fall back to its identifier", () => {
  assert.equal(
    getSettingLabel(
      create(SettingsDefinitionSchema, {
        id: { namespace: "bot", key: "delay" },
        type: {
          case: "minMax",
          value: {
            minEntry: { uiName: "Minimum delay" },
            maxEntry: { uiName: "Maximum delay" },
          },
        },
      }),
    ),
    "Minimum delay / Maximum delay",
  );
  assert.equal(
    getSettingLabel(
      create(SettingsDefinitionSchema, {
        id: { namespace: "bot", key: "timeout" },
      }),
    ),
    "timeout",
  );
});

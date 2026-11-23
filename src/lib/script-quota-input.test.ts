import assert from "node:assert/strict";
import { test } from "node:test";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { ScriptQuotasSchema } from "@/generated/soulfire/script_pb";
import {
  parseScriptQuotaInputs,
  scriptQuotasToInputs,
  type ScriptQuotaField,
} from "./script-quota-input";

test("quota input boundaries remain exact through protobuf serialization", () => {
  for (const quotas of [
    create(ScriptQuotasSchema, {
      maxExecutionCount: 9_007_199_254_740_993n,
      maxExecutionTimeMs: 9_223_372_036_854_775_807n,
      maxConcurrentTriggers: 2_147_483_647,
      maxStateStoreEntries: 0n,
    }),
    create(ScriptQuotasSchema, {
      maxExecutionCount: 0n,
      maxConcurrentTriggers: 1,
      disableTimeouts: true,
    }),
  ]) {
    const parsed = parseScriptQuotaInputs(scriptQuotasToInputs(quotas));
    assert.equal(parsed.valid, true);
    assert.ok(parsed.quotas);
    assert.deepEqual(
      fromBinary(
        ScriptQuotasSchema,
        toBinary(ScriptQuotasSchema, parsed.quotas),
      ),
      quotas,
    );
  }
});

test("empty fields restore defaults while zero and timeout overrides stay explicit", () => {
  const inputs = scriptQuotasToInputs(undefined);
  assert.deepEqual(
    parseScriptQuotaInputs({ ...inputs, maxExecutionCount: "  " }),
    { valid: true, quotas: undefined },
  );
  for (const changes of [
    { maxExecutionCount: "  +000  " },
    { disableTimeouts: true },
  ]) {
    const parsed = parseScriptQuotaInputs({ ...inputs, ...changes });
    assert.equal(parsed.valid, true);
    assert.ok(parsed.quotas);
    assert.equal(
      parsed.quotas.maxExecutionCount,
      "maxExecutionCount" in changes ? 0n : undefined,
    );
    assert.equal(parsed.quotas.disableTimeouts, "disableTimeouts" in changes);
    assert.equal(parsed.quotas.maxExecutionTimeMs, undefined);
  }
});

test("fractional, incomplete, negative, non-decimal and overflowing quotas identify every invalid field", () => {
  const inputs = scriptQuotasToInputs(undefined);
  const cases: [ScriptQuotaField, string][] = [
    ["maxExecutionCount", "1.5"],
    ["maxExecutionTimeMs", "1e3"],
    ["maxStateStoreEntries", "0x10"],
    ["maxExecutionCount", "-"],
    ["maxExecutionCount", "NaN"],
    ["maxExecutionTimeMs", "Infinity"],
    ["maxConcurrentTriggers", "1.5"],
    ["maxExecutionCount", "9223372036854775808"],
    ["maxExecutionTimeMs", "-1"],
    ["maxStateStoreEntries", "-5"],
    ["maxConcurrentTriggers", "0"],
    ["maxStateStoreEntries", "9223372036854775808"],
    ["maxConcurrentTriggers", "2147483648"],
    ["maxConcurrentTriggers", "-3"],
  ];
  for (const [field, value] of cases) {
    assert.deepEqual(parseScriptQuotaInputs({ ...inputs, [field]: value }), {
      valid: false,
      fields: [field],
    });
  }
  assert.deepEqual(
    parseScriptQuotaInputs({
      ...inputs,
      maxExecutionCount: "1.5",
      maxConcurrentTriggers: "2147483648",
    }),
    { valid: false, fields: ["maxExecutionCount", "maxConcurrentTriggers"] },
  );
});

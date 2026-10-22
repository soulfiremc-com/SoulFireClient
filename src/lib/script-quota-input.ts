import { create } from "@bufbuild/protobuf";
import {
  type ScriptQuotas,
  ScriptQuotasSchema,
} from "@/generated/soulfire/script_pb";

const int64 = {
  min: -9_223_372_036_854_775_808n,
  max: 9_223_372_036_854_775_807n,
};
const int32 = { min: -2_147_483_648n, max: 2_147_483_647n };

export const SCRIPT_QUOTA_LIMITS = {
  maxExecutionCount: int64,
  maxExecutionTimeMs: int64,
  maxConcurrentTriggers: int32,
  maxStateStoreEntries: int64,
};

export type ScriptQuotaField = keyof typeof SCRIPT_QUOTA_LIMITS;
export type ScriptQuotaInputs = Record<ScriptQuotaField, string> & {
  disableTimeouts: boolean;
};

export function scriptQuotasToInputs(
  quotas: ScriptQuotas | undefined,
): ScriptQuotaInputs {
  return {
    maxExecutionCount: quotas?.maxExecutionCount?.toString() ?? "",
    maxExecutionTimeMs: quotas?.maxExecutionTimeMs?.toString() ?? "",
    maxConcurrentTriggers: quotas?.maxConcurrentTriggers?.toString() ?? "",
    maxStateStoreEntries: quotas?.maxStateStoreEntries?.toString() ?? "",
    disableTimeouts: quotas?.disableTimeouts ?? false,
  };
}

export function parseScriptQuotaInputs(
  inputs: ScriptQuotaInputs,
):
  | { valid: true; quotas: ScriptQuotas | undefined }
  | { valid: false; fields: ScriptQuotaField[] } {
  const fields: ScriptQuotaField[] = [];
  const values: Partial<Record<ScriptQuotaField, bigint>> = {};
  for (const field of Object.keys(SCRIPT_QUOTA_LIMITS) as ScriptQuotaField[]) {
    const input = inputs[field].trim();
    if (!input) continue;
    const limit = SCRIPT_QUOTA_LIMITS[field];
    if (!/^[+-]?\d+$/.test(input)) {
      fields.push(field);
      continue;
    }
    const value = BigInt(input);
    if (value < limit.min || value > limit.max) fields.push(field);
    else values[field] = value;
  }
  if (fields.length) return { valid: false, fields };
  if (!Object.keys(values).length && !inputs.disableTimeouts)
    return { valid: true, quotas: undefined };
  return {
    valid: true,
    quotas: create(ScriptQuotasSchema, {
      ...values,
      maxConcurrentTriggers:
        values.maxConcurrentTriggers === undefined
          ? undefined
          : Number(values.maxConcurrentTriggers),
      disableTimeouts: inputs.disableTimeouts,
    }),
  };
}

import { create } from "@bufbuild/protobuf";
import {
  type ScriptQuotas,
  ScriptQuotasSchema,
} from "@/generated/soulfire/script_pb";

const INT64_MAX = 9_223_372_036_854_775_807n;
const INT32_MAX = 2_147_483_647n;

// Negative limits have no meaning, and the server runs triggers through a
// concurrency limit that rejects anything below one.
export const SCRIPT_QUOTA_LIMITS = {
  maxExecutionCount: { min: 0n, max: INT64_MAX },
  maxExecutionTimeMs: { min: 0n, max: INT64_MAX },
  maxConcurrentTriggers: { min: 1n, max: INT32_MAX },
  maxStateStoreEntries: { min: 0n, max: INT64_MAX },
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys returns the keys of SCRIPT_QUOTA_LIMITS, which are the quota fields
  for (const field of Object.keys(SCRIPT_QUOTA_LIMITS) as ScriptQuotaField[]) {
    const input = inputs[field].trim();
    if (!input) continue;
    const limit = SCRIPT_QUOTA_LIMITS[field];
    if (!/^\+?\d+$/u.test(input)) {
      fields.push(field);
      continue;
    }
    const value = BigInt(input);
    if (value < limit.min || value > limit.max) fields.push(field);
    else values[field] = value;
  }
  if (fields.length > 0) return { valid: false, fields };
  if (Object.keys(values).length === 0 && !inputs.disableTimeouts)
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

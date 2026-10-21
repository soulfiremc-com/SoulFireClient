export function getNumericSettingValue(
  draft: string | number,
  min: number,
  max: number,
  integer: boolean,
): number | undefined {
  if (typeof draft === "string" && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft)) {
    return undefined;
  }
  const value = typeof draft === "number" ? draft : Number(draft);
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    return undefined;
  }
  return value;
}

export type NumericRange = { min: number; max: number };

export function updateNumericRange(
  baseline: NumericRange,
  bound: "min" | "max",
  value: number,
): NumericRange {
  return bound === "min"
    ? { min: value, max: Math.max(baseline.max, value) }
    : { min: Math.min(baseline.min, value), max: value };
}

import { toIntlLocale } from "./intl-locale.ts";

export function getNumericSettingValue(
  draft: string | number,
  min: number,
  max: number,
  integer: boolean,
): number | undefined {
  if (
    typeof draft === "string" &&
    !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(draft)
  ) {
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

// oxlint-disable-next-line typescript/consistent-type-definitions -- ranges are stored as JSON setting values, and only a type alias is assignable to JsonValue
export type NumericRange = {
  min: number;
  max: number;
};

export function updateNumericRange(
  baseline: NumericRange,
  bound: "min" | "max",
  value: number,
): NumericRange {
  return bound === "min"
    ? { min: value, max: Math.max(baseline.max, value) }
    : { min: Math.min(baseline.min, value), max: value };
}

/**
 * Formats a setting number for display, with grouping only where the field
 * uses it. Takes the app language and maps it to a locale Intl understands.
 */
export function formatSettingNumber(
  value: number,
  language: string,
  grouping: boolean,
): string {
  return new Intl.NumberFormat(toIntlLocale(language), {
    useGrouping: grouping,
    maximumFractionDigits: 20,
  }).format(value);
}

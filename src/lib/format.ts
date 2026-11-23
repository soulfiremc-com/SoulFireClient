import { currentIntlLocale } from "@/lib/intl-locale.ts";

/// Intl unit names are decimal: "kB" means 1000 bytes. Divide by these
/// values so the numbers match the labels.
export const BYTES_PER_KILOBYTE = 1000;
export const BYTES_PER_MEGABYTE = 1000 * 1000;

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

// Building an Intl formatter is slow compared to formatting, and charts
// format every tick. Cache one formatter per language and option set.
function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = currentIntlLocale();
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = currentIntlLocale();
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) {
  if (!date) return "";

  try {
    return dateFormat({
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch {
    return "";
  }
}

function formatUnit(
  value: number,
  unit: string,
  maximumFractionDigits: number,
): string {
  return numberFormat({
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits,
  }).format(value);
}

/// Formats a byte count into a short human readable string.
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_KILOBYTE) return formatUnit(bytes, "byte", 0);
  if (bytes < BYTES_PER_MEGABYTE) {
    return formatUnit(bytes / BYTES_PER_KILOBYTE, "kilobyte", 1);
  }
  return formatUnit(bytes / BYTES_PER_MEGABYTE, "megabyte", 1);
}

/// Formats a bytes-per-second value into a short human readable string.
export function formatBytesPerSecond(bytes: number): string {
  if (bytes < BYTES_PER_KILOBYTE) {
    return formatUnit(bytes, "byte-per-second", 0);
  }
  if (bytes < BYTES_PER_MEGABYTE) {
    return formatUnit(bytes / BYTES_PER_KILOBYTE, "kilobyte-per-second", 1);
  }
  return formatUnit(bytes / BYTES_PER_MEGABYTE, "megabyte-per-second", 1);
}

/// Formats a megabyte value without decimals, for memory charts.
export function formatMegabytes(megabytes: number): string {
  return formatUnit(megabytes, "megabyte", 0);
}

/// Formats a duration in milliseconds, such as a tick time.
export function formatMilliseconds(
  milliseconds: number,
  maximumFractionDigits = 0,
): string {
  return formatUnit(milliseconds, "millisecond", maximumFractionDigits);
}

/// Formats a value on a 0 to 100 scale as a percentage.
export function formatPercent(
  percent: number,
  maximumFractionDigits = 0,
): string {
  return numberFormat({ style: "percent", maximumFractionDigits }).format(
    percent / 100,
  );
}

/// Formats a number into a compact representation (e.g. 1.2K, 3.4M).
export function formatCompactNumber(value: number): string {
  return numberFormat({
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/// Formats a number with the active locale's separators.
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return numberFormat(options).format(value);
}

/// Formats a number with a fixed count of fraction digits in the active locale.
export function formatFixed(value: number, digits: number): string {
  return formatNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

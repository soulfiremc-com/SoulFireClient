import type { FormatterModule } from "i18next";
import { toIntlLocale } from "@/lib/intl-locale.ts";

// Placeholders that hold counts. Their whole numbers get digit grouping, so
// "{{count}} proxies" reads "12,000 proxies" in English and "12.000" in German.
// Other placeholders, such as ports, coordinates, and setting values, stay as
// written.
const COUNT_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "checked",
  "connected",
  "count",
  "current",
  "desired",
  "done",
  "drawn",
  "executed",
  "failed",
  "loaded",
  "max",
  "min",
  "online",
  "page",
  "pending",
  "quantity",
  "queued",
  "received",
  "selected",
  "stock",
  "succeeded",
  "success",
  "total",
]);

/**
 * i18next formatter that groups the digits of counts in the translation's
 * language. It also supports `{{value, number}}`. i18next calls it for
 * placeholders without a format name only with `interpolation.alwaysFormat`.
 */
export class CountFormatter implements FormatterModule {
  readonly type = "formatter";
  private readonly numberFormats = new Map<string, Intl.NumberFormat>();

  init(): void {}

  add(): void {}

  addCached(): void {}

  format(
    value: unknown,
    format?: string,
    lng?: string,
    options?: Record<string, unknown>,
  ): string {
    // i18next types the result as a string, but it expects other values,
    // such as undefined for a missing placeholder, to come back unchanged.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- See above.
    if (typeof value !== "number") return value as string;
    const formatName = format?.trim().toLowerCase();
    const isCount =
      formatName === undefined &&
      Number.isInteger(value) &&
      COUNT_PLACEHOLDERS.has(String(options?.["interpolationkey"]));
    if (!isCount && formatName !== "number") return String(value);
    return this.numberFormat(lng).format(value);
  }

  private numberFormat(lng: string | undefined): Intl.NumberFormat {
    const locale = toIntlLocale(lng) ?? "en-US";
    let format = this.numberFormats.get(locale);
    if (!format) {
      format = new Intl.NumberFormat(locale);
      this.numberFormats.set(locale, format);
    }
    return format;
  }
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { changeLanguage, init } from "i18next";
import {
  formatBytes,
  formatBytesPerSecond,
  formatCompactNumber,
  formatDate,
  formatMegabytes,
  formatMilliseconds,
  formatNumber,
  formatPercent,
} from "@/lib/format.ts";

async function withLanguage(language: string, run: () => void) {
  await init({ lng: language, resources: {} });
  await changeLanguage(language);
  run();
}

test("formats sizes and counts in the active language", async () => {
  await withLanguage("de-DE", () => {
    assert.equal(formatBytesPerSecond(1536), "1,5 kB/s");
    assert.equal(formatMegabytes(2048), "2.048 MB");
    assert.equal(formatCompactNumber(1500), "1500");
    assert.equal(formatDate(new Date(2026, 0, 5)), "5. Januar 2026");
  });
});

test("English variant locales use English formats", async () => {
  await withLanguage("en-PT", () => {
    assert.equal(formatBytesPerSecond(1536), "1.5 kB/s");
    assert.equal(formatCompactNumber(1500), "1.5K");
    assert.equal(formatDate(new Date(2026, 0, 5)), "January 5, 2026");
  });
});

test("byte sizes use decimal units that match the kB and MB labels", async () => {
  await withLanguage("en-US", () => {
    assert.equal(formatBytes(999), "999 byte");
    assert.equal(formatBytes(1500), "1.5 kB");
    assert.equal(formatBytesPerSecond(2_500_000), "2.5 MB/s");
  });
});

test("durations and percentages follow the active language", async () => {
  await withLanguage("de-DE", () => {
    assert.equal(formatMilliseconds(12.5, 1), "12,5 ms");
    assert.equal(formatPercent(42.5, 1), "42,5\u00A0%");
  });
  await withLanguage("en-US", () => {
    assert.equal(formatPercent(42.5, 1), "42.5%");
  });
});

test("cached formatters switch with the language", async () => {
  await withLanguage("en-US", () => {
    assert.equal(formatNumber(1234.5), "1,234.5");
  });
  await withLanguage("de-DE", () => {
    assert.equal(formatNumber(1234.5), "1.234,5");
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { getPseudoLocale, toIntlLocale } from "@/lib/intl-locale.ts";

test("English variant locales format numbers like en-US", () => {
  for (const language of ["en-PT", "en-UD", "lol-US"]) {
    const locale = toIntlLocale(language);
    assert.equal(
      new Intl.NumberFormat(locale).format(1_234_567.89),
      "1,234,567.89",
      language,
    );
  }
});

test("real locales keep their own formats", () => {
  assert.equal(toIntlLocale("de-DE"), "de-DE");
  assert.equal(
    new Intl.NumberFormat(toIntlLocale("de-DE")).format(1234.5),
    "1.234,5",
  );
  assert.equal(toIntlLocale(undefined), undefined);
});

test("pseudo-locales have a menu name and emoji, real locales do not", () => {
  assert.equal(getPseudoLocale("en-PT")?.name, "Pirate English");
  assert.equal(getPseudoLocale("lol-US")?.emoji, "🐱");
  assert.equal(getPseudoLocale("de-DE"), undefined);
  // Object prototype keys are not locales.
  assert.equal(getPseudoLocale("constructor"), undefined);
});

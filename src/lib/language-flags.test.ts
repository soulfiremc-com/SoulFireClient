import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { getPseudoLocale } from "@/lib/intl-locale.ts";
import { getLanguageFlag } from "@/lib/language-flags.ts";

test("every translated locale has a flag in the language menu", () => {
  const locales = readdirSync(new URL("../../locales", import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // Pseudo-locales show an emoji instead of a country flag.
    .filter((locale) => !getPseudoLocale(locale));

  const missing = locales.filter((locale) => !getLanguageFlag(locale));
  assert.deepEqual(missing, []);
});

test("locales without a region have no flag", () => {
  assert.equal(getLanguageFlag("en"), undefined);
});

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import {
  getLoadedDateFnsLocale,
  isDateFnsLocaleLoaded,
  loadDateFnsLocale,
} from "@/lib/date-fns-locale.ts";

const appLocales = readdirSync(new URL("../../locales", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// These locales are English variants without their own date-fns locale.
const englishLocales = new Set(["en-US", "en-PT", "en-UD", "lol-US"]);

test("every translated app locale loads a matching date-fns locale", async () => {
  for (const appLocale of appLocales) {
    const locale = await loadDateFnsLocale(appLocale);
    if (englishLocales.has(appLocale)) {
      assert.equal(locale.code, "en-US", appLocale);
      continue;
    }

    const [language] = appLocale.split("-");
    assert.ok(
      locale.code === appLocale || locale.code === language,
      `${appLocale} resolved to ${locale.code}`,
    );
  }
});

test("regional Chinese and Portuguese locales keep their region", async () => {
  assert.equal((await loadDateFnsLocale("zh-TW")).code, "zh-TW");
  assert.equal((await loadDateFnsLocale("pt-BR")).code, "pt-BR");
});

test("a loaded locale is available synchronously", async () => {
  await loadDateFnsLocale("de-DE");
  assert.ok(isDateFnsLocaleLoaded("de-DE"));
  assert.equal(getLoadedDateFnsLocale("de-DE").code, "de");
});

test("unknown languages fall back to English without loading", () => {
  assert.ok(isDateFnsLocaleLoaded("xx-XX"));
  assert.equal(getLoadedDateFnsLocale("xx-XX").code, "en-US");
});

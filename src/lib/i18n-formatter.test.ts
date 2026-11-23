import assert from "node:assert/strict";
import { test } from "node:test";
import { createInstance } from "i18next";
import { CountFormatter } from "@/lib/i18n-formatter.ts";

async function translator(lng: string) {
  const i18n = createInstance();
  await i18n.use(new CountFormatter()).init({
    lng,
    resources: {
      [lng]: {
        translation: {
          imported_one: "Imported {{count}} proxy",
          imported_other: "Imported {{count}} proxies",
          progress: "{{checked}}/{{total}}",
          port: "Default: {{value}}",
          coordinates: "{{x}}, {{y}}",
          ratio: "{{count}} of {{name}}",
          explicit: "{{value, number}}",
        },
      },
    },
    interpolation: { escapeValue: false, alwaysFormat: true },
  });
  return i18n.t.bind(i18n);
}

test("groups the digits of counts in the active language", async () => {
  const en = await translator("en-US");
  assert.equal(en("imported", { count: 12_000 }), "Imported 12,000 proxies");
  assert.equal(en("imported", { count: 1 }), "Imported 1 proxy");
  assert.equal(
    en("progress", { checked: 1500, total: 20_000 }),
    "1,500/20,000",
  );

  const de = await translator("de-DE");
  assert.equal(de("imported", { count: 12_000 }), "Imported 12.000 proxies");
});

test("English variant locales group digits like en-US", async () => {
  const pirate = await translator("en-PT");
  assert.equal(
    pirate("imported", { count: 12_000 }),
    "Imported 12,000 proxies",
  );
});

test("leaves values that are not counts as written", async () => {
  const en = await translator("en-US");
  assert.equal(en("port", { value: 25_565 }), "Default: 25565");
  assert.equal(en("coordinates", { x: -12_000, y: 64 }), "-12000, 64");
  assert.equal(en("ratio", { count: "1234", name: "x" }), "1234 of x");
  assert.equal(en("imported", { count: 2.5 }), "Imported 2.5 proxies");
});

test("formats placeholders with an explicit number format", async () => {
  const en = await translator("en-US");
  assert.equal(en("explicit", { value: 25_565 }), "25,565");
});

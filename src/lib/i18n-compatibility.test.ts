import assert from "node:assert/strict";
import { test } from "node:test";
import { createInstance } from "i18next";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider, initReactI18next, Trans } from "react-i18next";

test("translated React text escapes interpolated values once", async () => {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: { greeting: "Hello {{name}}" } } },
    interpolation: { escapeValue: true },
  });

  const markup = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(Trans, {
        i18nKey: "greeting",
        values: { name: "Tom & Jerry" },
      }),
    ),
  );

  assert.equal(markup, "Hello Tom &amp; Jerry");
});

test("translated React plurals follow the selected language", async () => {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: {
      en: {
        translation: {
          bots_one: "{{count}} bot",
          bots_other: "{{count}} bots",
        },
      },
      de: {
        translation: {
          bots_one: "{{count}} Bot",
          bots_other: "{{count}} Bots",
        },
      },
    },
  });

  const render = (count: number) =>
    renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(Trans, { i18nKey: "bots", count }),
      ),
    );

  assert.equal(render(1), "1 bot");
  assert.equal(render(2), "2 bots");
  await i18n.changeLanguage("de");
  assert.equal(render(1), "1 Bot");
  assert.equal(render(2), "2 Bots");
});

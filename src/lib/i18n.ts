import i18n, { use as addI18nextModule } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { loadDateFnsLocale } from "@/lib/date-fns-locale.ts";
import { toIntlLocale } from "@/lib/intl-locale.ts";

// Start loading the date-fns locale with the translations, so relative times
// render in the active language without an English first pass.
i18n.on("languageChanged", (language) => {
  // Screen readers and browser translation read the page language from here.
  document.documentElement.lang = toIntlLocale(
    i18n.resolvedLanguage ?? language,
  );
  loadDateFnsLocale(i18n.resolvedLanguage ?? language).catch(() => {
    // Components fall back to English dates when the chunk fails to load.
  });
});

void addI18nextModule(
  resourcesToBackend(
    (lng: string, ns: string) => import(`../../locales/${lng}/${ns}.json`),
  ),
)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    defaultNS: "common",
    fallbackLng: "en-US",
    /// debug: true,

    load: "currentOnly",
    supportedLngs: APP_LOCALES.split(","),
    ns: APP_NAMESPACES.split(","),
    lowerCaseLng: false,
    nonExplicitSupportedLngs: false,
    returnEmptyString: false,
    returnNull: false,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;

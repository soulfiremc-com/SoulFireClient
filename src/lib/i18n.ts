import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
void i18n
  .use(
    resourcesToBackend((lng: string, ns: string) => {
      return import(`../../locales/${lng}/${ns}.json`);
    }),
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

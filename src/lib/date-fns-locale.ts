import type { Locale } from "date-fns";
import { enUS } from "date-fns/locale/en-US";

// Each entry is a separate chunk, so the app only downloads the date-fns
// locale for the active language. Languages without an entry use enUS.
const localeLoaders: Record<string, () => Promise<Locale>> = {
  "az-AZ": () => import("date-fns/locale/az").then((m) => m.az),
  "cs-CZ": () => import("date-fns/locale/cs").then((m) => m.cs),
  "de-DE": () => import("date-fns/locale/de").then((m) => m.de),
  "es-ES": () => import("date-fns/locale/es").then((m) => m.es),
  "fi-FI": () => import("date-fns/locale/fi").then((m) => m.fi),
  "fr-FR": () => import("date-fns/locale/fr").then((m) => m.fr),
  "hi-IN": () => import("date-fns/locale/hi").then((m) => m.hi),
  "id-ID": () => import("date-fns/locale/id").then((m) => m.id),
  "it-IT": () => import("date-fns/locale/it").then((m) => m.it),
  "ja-JP": () => import("date-fns/locale/ja").then((m) => m.ja),
  "ko-KR": () => import("date-fns/locale/ko").then((m) => m.ko),
  "nl-NL": () => import("date-fns/locale/nl").then((m) => m.nl),
  "pl-PL": () => import("date-fns/locale/pl").then((m) => m.pl),
  "pt-BR": () => import("date-fns/locale/pt-BR").then((m) => m.ptBR),
  "ru-RU": () => import("date-fns/locale/ru").then((m) => m.ru),
  "sk-SK": () => import("date-fns/locale/sk").then((m) => m.sk),
  "sv-SE": () => import("date-fns/locale/sv").then((m) => m.sv),
  "th-TH": () => import("date-fns/locale/th").then((m) => m.th),
  "tr-TR": () => import("date-fns/locale/tr").then((m) => m.tr),
  "uk-UA": () => import("date-fns/locale/uk").then((m) => m.uk),
  "vi-VN": () => import("date-fns/locale/vi").then((m) => m.vi),
  "zh-CN": () => import("date-fns/locale/zh-CN").then((m) => m.zhCN),
  "zh-TW": () => import("date-fns/locale/zh-TW").then((m) => m.zhTW),
};

const loadedLocales = new Map<string, Locale>();

export function getLoadedDateFnsLocale(language: string): Locale {
  return loadedLocales.get(language) ?? enUS;
}

export function isDateFnsLocaleLoaded(language: string): boolean {
  return loadedLocales.has(language) || !(language in localeLoaders);
}

const pendingLocales = new Map<string, Promise<Locale>>();

export function loadDateFnsLocale(language: string): Promise<Locale> {
  const cached = loadedLocales.get(language);
  if (cached) return Promise.resolve(cached);

  const loader = localeLoaders[language];
  if (!loader) return Promise.resolve(enUS);

  let pending = pendingLocales.get(language);
  if (!pending) {
    pending = loader()
      .then((locale) => {
        loadedLocales.set(language, locale);
        return locale;
      })
      .finally(() => {
        pendingLocales.delete(language);
      });
    pendingLocales.set(language, pending);
  }
  return pending;
}

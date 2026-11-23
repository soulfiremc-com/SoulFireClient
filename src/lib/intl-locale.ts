import i18n from "i18next";

interface PseudoLocale {
  /** Name in the language menu. Intl does not know these languages. */
  name: string;
  /** Shown in place of a country flag. */
  emoji: string;
}

// These app locales are English variants. Intl does not know them, or reads
// them as a region: "en-PT" would format numbers as English in Portugal.
// They format numbers and dates as en-US.
export const PSEUDO_LOCALES: Readonly<Record<string, PseudoLocale>> = {
  "en-PT": { name: "Pirate English", emoji: "🏴‍☠️" },
  "en-UD": { name: "Upside Down English", emoji: "🙃" },
  "lol-US": { name: "LOLCAT", emoji: "🐱" },
};

export function getPseudoLocale(language: string): PseudoLocale | undefined {
  return Object.hasOwn(PSEUDO_LOCALES, language)
    ? PSEUDO_LOCALES[language]
    : undefined;
}

/** Returns the locale to pass to Intl for an app language. */
export function toIntlLocale(language: string): string;
export function toIntlLocale(language: string | undefined): string | undefined;
export function toIntlLocale(language: string | undefined): string | undefined {
  if (language === undefined) return undefined;
  return getPseudoLocale(language) ? "en-US" : language;
}

/** Returns the Intl locale for the active app language. */
export function currentIntlLocale(): string | undefined {
  return toIntlLocale(i18n.resolvedLanguage ?? i18n.language);
}

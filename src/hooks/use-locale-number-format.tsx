import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toIntlLocale } from "@/lib/intl-locale.ts";

export interface LocaleNumberFormat {
  thousandSeparator: string;
  decimalSeparator: string;
}

export function useLocaleNumberFormat(): LocaleNumberFormat {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return useMemo<LocaleNumberFormat>(() => {
    const formatter = new Intl.NumberFormat(toIntlLocale(language));
    const parts = formatter.formatToParts(1_234_567.89);

    let thousandSeparator = ",";
    let decimalSeparator = ".";
    parts.forEach((part) => {
      if (part.type === "group") {
        thousandSeparator = part.value;
      }
      if (part.type === "decimal") {
        decimalSeparator = part.value;
      }
    });

    return {
      thousandSeparator,
      decimalSeparator,
    };
  }, [language]);
}

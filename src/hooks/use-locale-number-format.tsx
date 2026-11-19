import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface LocaleNumberFormat {
  thousandSeparator: string;
  decimalSeparator: string;
}

export function useLocaleNumberFormat(): LocaleNumberFormat {
  const { i18n } = useTranslation();
  return useMemo<LocaleNumberFormat>(() => {
    const formatter = new Intl.NumberFormat(i18n.language);
    const parts = formatter.formatToParts(1234567.89);

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
  }, [i18n.language]);
}

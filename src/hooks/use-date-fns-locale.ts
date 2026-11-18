import type { Locale } from "date-fns";
import { useEffect, useReducer } from "react";
import { useTranslation } from "react-i18next";
import {
  getLoadedDateFnsLocale,
  isDateFnsLocaleLoaded,
  loadDateFnsLocale,
} from "@/lib/date-fns-locale.ts";

export function useDateFnsLocale(): Locale {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? "en-US";
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (isDateFnsLocaleLoaded(language)) return undefined;

    let active = true;
    loadDateFnsLocale(language).then(
      () => {
        if (active) rerender();
      },
      () => {
        // Keep the English fallback when the locale chunk fails to load.
      },
    );
    return () => {
      active = false;
    };
  }, [language]);

  return getLoadedDateFnsLocale(language);
}

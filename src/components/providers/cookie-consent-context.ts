import { createContext, use } from "react";

type CookieConsentContextValue = {
  openCookiePreferences: () => void;
};

export const CookieConsentContext =
  createContext<CookieConsentContextValue | null>(null);

export function useCookieConsentContext(): CookieConsentContextValue {
  const value = use(CookieConsentContext);
  if (value === null)
    throw new Error("CookieConsentContext is used outside its provider");
  return value;
}

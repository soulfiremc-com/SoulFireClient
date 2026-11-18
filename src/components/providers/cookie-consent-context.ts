import { createContext } from "react";

export const CookieConsentContext = createContext<{
  openCookiePreferences: () => void;
}>(null as never);

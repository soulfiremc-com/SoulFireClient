import { createContext, use } from "react";

type TerminalThemeContextValue = {
  value: string;
  setter: (value: string) => void;
};

export const TerminalThemeContext =
  createContext<TerminalThemeContextValue | null>(null);

export function useTerminalThemeContext(): TerminalThemeContextValue {
  const value = use(TerminalThemeContext);
  if (value === null)
    throw new Error("TerminalThemeContext is used outside its provider");
  return value;
}

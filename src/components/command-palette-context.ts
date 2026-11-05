import { createContext, use } from "react";

export type OpenCommandPalette = (options?: { search?: string }) => void;

export const CommandPaletteContext = createContext<OpenCommandPalette | null>(
  null,
);

/** Opens the command menu, or returns null outside the authenticated app. */
export function useCommandPalette(): OpenCommandPalette | null {
  return use(CommandPaletteContext);
}

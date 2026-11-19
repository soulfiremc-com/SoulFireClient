import { createContext, use } from "react";

interface AboutContextValue {
  openAbout: () => void;
}

export const AboutContext = createContext<AboutContextValue | null>(null);

export function useAboutContext(): AboutContextValue {
  const value = use(AboutContext);
  if (value === null)
    throw new Error("AboutContext is used outside its provider");
  return value;
}

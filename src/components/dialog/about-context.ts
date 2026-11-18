import { createContext } from "react";

export const AboutContext = createContext<{
  openAbout: () => void;
}>(null as never);

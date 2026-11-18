import { createContext } from "react";

export const CreateInstanceContext = createContext<{
  openCreateInstance: () => void;
}>(null as never);

import { createContext, use } from "react";

interface CreateInstanceContextValue {
  openCreateInstance: () => void;
}

export const CreateInstanceContext =
  createContext<CreateInstanceContextValue | null>(null);

export function useCreateInstanceContext(): CreateInstanceContextValue {
  const value = use(CreateInstanceContext);
  if (value === null)
    throw new Error("CreateInstanceContext is used outside its provider");
  return value;
}

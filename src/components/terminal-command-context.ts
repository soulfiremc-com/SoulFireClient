import { createContext, type RefObject } from "react";

export type TerminalCommandAction = "run_command" | "suggest_command";
export type TerminalCommandHandler = (
  action: TerminalCommandAction,
  value: string,
) => void;

// Only a mounted, permission-gated CommandInput can register a command handler.
export const TerminalCommandContext =
  createContext<RefObject<TerminalCommandHandler | null> | null>(null);

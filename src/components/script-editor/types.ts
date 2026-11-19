import type { TerminalLogContent } from "@/lib/terminal-interactions";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry extends TerminalLogContent {
  id: string;
  timestamp: Date;
  level: LogLevel;
  nodeId: string | null;
}

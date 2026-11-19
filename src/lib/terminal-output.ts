import {
  terminalLogText as logText,
  type TerminalInteraction,
} from "./terminal-interactions";
import type { WTerm } from "@wterm/dom";
import { stripAnsi } from "fancy-ansi";
import type { TerminalLine } from "@/stores/terminal-log-store";

const RESET = "\u001B[0m\u001B[3J\u001B[2J\u001B[H\u001B[?25l";

export function formatTerminalPrefix(
  entry: TerminalLine,
  locale?: string,
): string {
  const logger = entry.loggerName?.startsWith("com.soulfiremc.")
    ? entry.loggerName.slice(entry.loggerName.lastIndexOf(".") + 1)
    : entry.loggerName;
  return [
    entry.level,
    entry.timestamp &&
      new Date(
        Number(entry.timestamp.seconds) * 1000 + entry.timestamp.nanos / 1e6,
      ).toLocaleTimeString(locale),
    entry.instanceName &&
      `${entry.instanceName}${entry.botAccountName ? `:${entry.botAccountName}` : ""}`,
    logger,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => logText(part, false).replaceAll("\n", " "))
    .join(" ");
}

export function formatTerminalLine(
  entry: TerminalLine,
  locale?: string,
  register?: (metadata: TerminalInteraction) => string,
): string {
  const prefix = formatTerminalPrefix(entry, locale);
  const level = entry.level?.toUpperCase();
  const color =
    level === "WARN"
      ? "\u001B[33m"
      : level === "ERROR" || level === "FATAL"
        ? "\u001B[31m"
        : "";
  const message = logText(
    entry.message,
    true,
    entry.personal && entry.terminalInteractions ? register : undefined,
  );
  return (
    "\u001B[0m" +
    (prefix ? `${color}${prefix}\u001B[0m ` : "") +
    message.replaceAll("\n", "\r\n") +
    "\u001B[0m" +
    (stripAnsi(message).endsWith("\n") ? "" : "\r\n")
  );
}

type OutputTerminal = Pick<WTerm, "write" | "bridge">;

export function createTerminalOutput(terminal: OutputTerminal) {
  const interactions = new Map<string, TerminalInteraction>();
  let nextInteraction = 0;
  const register = (metadata: TerminalInteraction) => {
    // wterm retains opaque OSC 8 identities on cells but does not render this
    // scheme as a navigable link. Only this registry can resolve an action.
    const uri = `soulfire-interaction:${nextInteraction++}`;
    interactions.set(uri, metadata);
    return uri;
  };
  let previous: readonly TerminalLine[] = [];
  let previousLocale: string | undefined;
  let starts = new Map<TerminalLine, number>();
  let previousDiscarded = 0;
  const discarded = () => terminal.bridge?.getScrollbackDiscardedCount?.() ?? 0;
  const row = () => {
    const core = terminal.bridge;
    return core
      ? discarded() + core.getScrollbackCount() + core.getCursor().row
      : 0;
  };

  return {
    interactions,
    sync(entries: readonly TerminalLine[], locale?: string, resized = false) {
      const append =
        !resized &&
        locale === previousLocale &&
        previous.length <= entries.length &&
        previous.every((entry, index) => entry === entries[index]);
      const retained = entries.find((entry) => starts.has(entry));
      const oldStart = retained === undefined ? 0 : (starts.get(retained) ?? 0);
      const offset = append ? previous.length : 0;
      if (!append || previous.length === 0) {
        terminal.write(RESET);
        starts = new Map();
        interactions.clear();
      }
      for (const entry of entries.slice(offset)) {
        starts.set(entry, row());
        terminal.write(formatTerminalLine(entry, locale, register));
      }
      previous = entries;
      previousLocale = locale;
      const newStart =
        retained === undefined ? undefined : starts.get(retained);
      const rowShift =
        newStart === undefined
          ? 0
          : newStart - discarded() - oldStart + previousDiscarded;
      previousDiscarded = discarded();
      return {
        reset: !append,
        rowShift,
      };
    },
  };
}

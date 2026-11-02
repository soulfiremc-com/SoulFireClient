/* eslint-disable no-control-regex -- Terminal output requires matching ANSI control sequences. */
import {
  terminalLogText as logText,
  type TerminalInteraction,
} from "./terminal-interactions";
import type { WTerm } from "@wterm/dom";
import { stripAnsi } from "fancy-ansi";
import type { TerminalLine } from "@/stores/terminal-log-store";

const RESET = "\x1b[0m\x1b[3J\x1b[2J\x1b[H\x1b[?25l";

export function formatTerminalLine(
  entry: TerminalLine,
  locale?: string,
  register?: (metadata: TerminalInteraction) => string,
): string {
  const logger = entry.loggerName?.startsWith("com.soulfiremc.")
    ? entry.loggerName.slice(entry.loggerName.lastIndexOf(".") + 1)
    : entry.loggerName;
  const prefix = [
    entry.level,
    entry.timestamp &&
      new Date(
        Number(entry.timestamp.seconds) * 1000 + entry.timestamp.nanos / 1e6,
      ).toLocaleTimeString(locale),
    entry.instanceName &&
      `${entry.instanceName}${entry.botAccountName ? `:${entry.botAccountName}` : ""}`,
    logger,
  ]
    .filter(Boolean)
    .map((part) => logText(part!, false).replace(/\n/g, " "))
    .join(" ");
  const level = entry.level?.toUpperCase();
  const color =
    level === "WARN"
      ? "\x1b[33m"
      : level === "ERROR" || level === "FATAL"
        ? "\x1b[31m"
        : "";
  const message = logText(
    entry.message,
    true,
    entry.personal && entry.terminalInteractions ? register : undefined,
  );
  return (
    "\x1b[0m" +
    (prefix ? `${color}${prefix}\x1b[0m ` : "") +
    message.replace(/\n/g, "\r\n") +
    "\x1b[0m" +
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
      const oldStart = retained ? starts.get(retained)! : 0;
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
      const rowShift = retained
        ? starts.get(retained)! - discarded() - oldStart + previousDiscarded
        : 0;
      previousDiscarded = discarded();
      return {
        reset: !append,
        rowShift,
      };
    },
  };
}

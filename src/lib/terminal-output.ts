/* eslint-disable no-control-regex -- Terminal output requires matching ANSI control sequences. */
import type { WTerm } from "@wterm/dom";
import { stripAnsi } from "fancy-ansi";
import type { TerminalLine } from "@/stores/terminal-log-store";

const RESET = "\x1b[0m\x1b[3J\x1b[2J\x1b[H\x1b[?25l";

// Logs may style text, but must not move the cursor, clear history, or request
// clipboard access. Consume whole control strings, including unfinished ones.
function logText(value: string, colors = true): string {
  return value
    .replace(
      /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]?|(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])[\s\S]*?(?:\x07|\x1b\\|\x9c|$)|\x1b[ -/]*[0-~]?/g,
      (sequence) =>
        colors && /^\x1b\[[\d;:]*m$/.test(sequence) ? sequence : "",
    )
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (control) =>
      control === "\x1b" ? control : "",
    );
}

export function formatTerminalLine(
  entry: TerminalLine,
  locale?: string,
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
  const message = logText(entry.message);
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
      }
      for (const entry of entries.slice(offset)) {
        starts.set(entry, row());
        terminal.write(formatTerminalLine(entry, locale));
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

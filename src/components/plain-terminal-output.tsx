import { Fragment } from "react";
import type { TerminalCommandHandler } from "@/components/terminal-command-context";
import { TerminalMessage } from "@/components/terminal-message";
import { terminalLogText } from "@/lib/terminal-interactions";
import { formatTerminalPrefix } from "@/lib/terminal-output";
import type { TerminalLine } from "@/stores/terminal-log-store";

export function PlainTerminalOutput({
  entries,
  locale,
  onCommand,
}: {
  entries: readonly TerminalLine[];
  locale?: string;
  onCommand?: TerminalCommandHandler;
}) {
  return (
    <pre
      data-terminal-plain
      className="h-full overflow-auto p-1 font-mono text-xs whitespace-pre-wrap break-all select-text"
    >
      {entries.map((entry) => {
        const prefix = formatTerminalPrefix(entry, locale);
        return (
          <Fragment key={entry.id}>
            {prefix ? `${prefix} ` : ""}
            <TerminalMessage entry={entry} onCommand={onCommand} />
            {terminalLogText(entry.message, false).endsWith("\n") ? "" : "\n"}
          </Fragment>
        );
      })}
    </pre>
  );
}

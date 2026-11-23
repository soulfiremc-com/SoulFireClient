import { Fragment } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
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
  locale?: string | undefined;
  onCommand?: TerminalCommandHandler | undefined;
}) {
  // Follow new output like the terminal view, unless the reader scrolls up.
  const { scrollRef, contentRef } = useStickToBottom({
    initial: "instant",
    resize: "instant",
  });
  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <pre
        ref={contentRef}
        data-terminal-plain
        className="p-1 font-mono text-xs break-all whitespace-pre-wrap select-text"
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
    </div>
  );
}

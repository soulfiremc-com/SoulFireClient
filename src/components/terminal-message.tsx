import { Fragment, memo, useId, useMemo, useRef, useState } from "react";
import type { TerminalCommandHandler } from "@/components/terminal-command-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTerminalInteractionActions } from "@/hooks/use-terminal-interaction-actions";
import {
  parseTerminalText,
  type TerminalLogContent,
  type TerminalTextSpan,
} from "@/lib/terminal-interactions";

function InteractiveText({
  span,
  onCommand,
}: {
  span: TerminalTextSpan;
  onCommand?: TerminalCommandHandler;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const actions = useTerminalInteractionActions(onCommand);
  const metadata = span.interaction!;
  const description = actions.description(metadata.click);
  return (
    <Tooltip open={open} onOpenChange={setOpen} triggerId={id}>
      <TooltipTrigger
        id={id}
        render={
          metadata.click ? <button type="button" /> : <span tabIndex={0} />
        }
        variant="inline"
        aria-label={
          metadata.click
            ? [span.text, description].filter(Boolean).join(". ")
            : undefined
        }
        aria-describedby={open ? `${id}-tooltip` : undefined}
        aria-disabled={
          metadata.click && actions.disabled(metadata.click) ? true : undefined
        }
        onPointerDown={(event) => {
          down.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerCancel={() => {
          down.current = null;
        }}
        onClick={(event) => {
          const start = down.current;
          down.current = null;
          event.stopPropagation();
          if (
            !metadata.click ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            event.detail > 1
          )
            return;
          if (
            event.detail !== 0 &&
            (!start ||
              Math.hypot(start.x - event.clientX, start.y - event.clientY) >
                5 ||
              event.currentTarget.ownerDocument.getSelection()?.isCollapsed ===
                false)
          )
            return;
          actions.activate(metadata);
        }}
      >
        {span.text}
      </TooltipTrigger>
      <TooltipContent role="tooltip" id={`${id}-tooltip`}>
        <span className="whitespace-pre-wrap break-all">
          {actions.tooltip(metadata)}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// Both provenance flags are required. React escapes the visible text and hover
// content; only validated metadata creates controls, never HTML from a log.
export const TerminalMessage = memo(function TerminalMessage({
  entry,
  onCommand,
}: {
  entry: TerminalLogContent;
  onCommand?: TerminalCommandHandler;
}) {
  const { message, personal, terminalInteractions } = entry;
  const spans = useMemo(
    () => parseTerminalText({ message, personal, terminalInteractions }),
    [message, personal, terminalInteractions],
  );
  return (
    <>
      {spans.map((span) => (
        <Fragment key={span.start}>
          {span.interaction ? (
            <InteractiveText span={span} onCommand={onCommand} />
          ) : (
            span.text
          )}
        </Fragment>
      ))}
    </>
  );
});

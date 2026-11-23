import { flavorEntries, flavors } from "@catppuccin/palette";
import { WTerm } from "@wterm/dom";
import { ArrowDownIcon } from "lucide-react";
import {
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { PlainTerminalOutput } from "@/components/plain-terminal-output";
import { ContextMenuPortal } from "@/components/context-menu-portal";
import { SelectedTextActions } from "@/components/custom-context-menu";
import { useTerminalThemeContext } from "@/components/providers/terminal-theme-context";
import { TransportContext } from "@/components/providers/transport-context";
import { Button } from "@/components/ui/button";
import type { LogScope } from "@/generated/soulfire/logs_pb";
import {
  TerminalCommandContext,
  type TerminalCommandHandler,
} from "@/components/terminal-command-context";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useTerminalInteractionActions } from "@/hooks/use-terminal-interaction-actions";
import {
  terminalInteractionAt,
  visibleTerminalInteractions,
  type TerminalInteractionRun,
} from "@/lib/terminal-interaction-cells";
import { useContextMenu } from "@/hooks/use-context-menu";
import { useTerminalLogs } from "@/hooks/use-terminal-logs";
import { readableTerminalColor } from "@/lib/terminal-colors";
import { toIntlLocale } from "@/lib/intl-locale.ts";
import { createTerminalOutput } from "@/lib/terminal-output";
import { isDemo } from "@/lib/utils";
import { type TerminalLine, toTerminalLine } from "@/stores/terminal-log-store";

export function TerminalView({
  entries,
  theme,
  children,
}: {
  entries: readonly TerminalLine[];
  theme: string;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation("common");
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<WTerm | null>(null);
  const outputRef = useRef<ReturnType<typeof createTerminalOutput> | null>(
    null,
  );
  const interactionId = useId();
  const commandHandler = useRef<TerminalCommandHandler | null>(null);
  const onCommand: TerminalCommandHandler | undefined = children
    ? (action, value) => commandHandler.current?.(action, value)
    : undefined;
  const actions = useTerminalInteractionActions(onCommand);
  const [runs, setRuns] = useState<TerminalInteractionRun[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const pointerDown = useRef<{
    x: number;
    y: number;
    uri?: string | undefined;
    touch: boolean;
  } | null>(null);
  // Set when output arrives while the reader has scrolled away from the end.
  const [newBelow, setNewBelow] = useState(false);
  const lastEntry = useRef<TerminalLine | undefined>(undefined);
  const interactionFrame = useRef(0);
  const metrics = useRef({ width: 0, height: 0, top: 0, left: 0 });

  // Reads only refs, so scroll handlers can call it through animation frames.
  const updateInteractions = () => {
    const host = hostRef.current;
    const core = terminalRef.current?.bridge;
    const registry = outputRef.current?.interactions;
    if (!host || !core || !registry) return;
    const style = getComputedStyle(host);
    const width = parseFloat(style.getPropertyValue("--term-cell-width"));
    const height = parseFloat(style.getPropertyValue("--term-row-height"));
    const top = parseFloat(style.paddingTop) || 0;
    const left = parseFloat(style.paddingLeft) || 0;
    if (!(width > 0 && height > 0)) return;
    metrics.current = { width, height, top, left };
    const first = Math.floor((host.scrollTop - top) / height);
    setRuns(
      visibleTerminalInteractions(
        core,
        registry,
        first,
        Math.ceil((host.scrollTop + host.clientHeight - top) / height),
      ),
    );
  };
  const scheduleInteractions = () => {
    cancelAnimationFrame(interactionFrame.current);
    interactionFrame.current = requestAnimationFrame(() => {
      updateInteractions();
    });
  };
  const interactionAt = (x: number, y: number) => {
    const host = hostRef.current;
    const core = terminalRef.current?.bridge;
    if (!host || !core) return undefined;
    const rect = host.getBoundingClientRect();
    const { width, height, top, left } = metrics.current;
    if (!width || !height) return undefined;
    return terminalInteractionAt(
      core,
      Math.floor((y - rect.top + host.scrollTop - top) / height),
      Math.floor((x - rect.left + host.scrollLeft - left) / width),
    );
  };
  const scrollFrame = useRef(0);
  const [failed, setFailed] = useState(false);
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<string>();
  const selectedTheme =
    flavorEntries.find(([name]) => name === theme)?.[1] ?? flavors.latte;
  const { colors, dark } = selectedTheme;

  const applyTheme = useEffectEvent(() => {
    const rgb = (hex: string) => Number.parseInt(hex.slice(1), 16);
    const palette = [
      dark ? colors.surface1 : colors.subtext1,
      colors.red,
      colors.green,
      colors.yellow,
      colors.blue,
      colors.pink,
      colors.teal,
      dark ? colors.subtext0 : colors.surface2,
      dark ? colors.surface2 : colors.subtext0,
      colors.red,
      colors.green,
      colors.yellow,
      colors.blue,
      colors.pink,
      colors.teal,
      dark ? colors.subtext1 : colors.surface1,
    ];
    terminalRef.current?.setThemeColors({
      foreground: rgb(colors.text.hex),
      background: rgb(colors.base.hex),
      cursor: rgb(colors.text.hex),
      // Catppuccin keeps some ANSI colors close to the base color. Logs and
      // chat use them for text, so lift each one to readable contrast.
      palette: palette.map((color) =>
        rgb(readableTerminalColor(color.hex, colors.base.hex, colors.text.hex)),
      ),
    });
  });

  const syncOutput = useEffectEvent((resized = false) => {
    const host = hostRef.current;
    const output = outputRef.current;
    if (!host || !output) return;
    const top = host.scrollTop;
    const atBottom = top + host.clientHeight >= host.scrollHeight - 1;
    const update = output.sync(
      entries,
      toIntlLocale(i18n.resolvedLanguage),
      resized,
    );
    const latest = entries.at(-1);
    if (!atBottom && lastEntry.current && latest !== lastEntry.current)
      setNewBelow(true);
    lastEntry.current = latest;
    setHovered(null);
    scheduleInteractions();
    if (update.reset && !atBottom) {
      const rowHeight = Number.parseFloat(
        getComputedStyle(host).getPropertyValue("--term-row-height"),
      );
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => {
        host.scrollTop = Math.max(0, top + update.rowShift * rowHeight);
        scheduleInteractions();
      });
    }
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disposed = false;
    const previouslyFocused = document.activeElement;
    const terminal = new WTerm(host, {
      cursorBlink: false,
      // Commands continue to use CommandInput and its permission checks.
      onData: () => {},
      onResize: () => {
        if (outputRef.current) syncOutput(true);
      },
    });
    terminalRef.current = terminal;
    applyTheme();
    void terminal.init().then(
      () => {
        if (disposed) return;
        const input = host.querySelector("textarea");
        if (input) {
          input.readOnly = true;
          // WTerm focuses its input during init. Opening a log view should keep
          // focus on the command field or navigation that opened it.
          if (document.activeElement === input) {
            input.blur();
            if (previouslyFocused instanceof HTMLElement)
              previouslyFocused.focus({ preventScroll: true });
          }
        }
        outputRef.current = createTerminalOutput(terminal);
        syncOutput();
      },
      (error: unknown) => {
        if (disposed) return;
        console.error("Could not initialize terminal", error);
        terminal.destroy();
        terminalRef.current = null;
        setFailed(true);
      },
    );
    return () => {
      disposed = true;
      cancelAnimationFrame(scrollFrame.current);
      cancelAnimationFrame(interactionFrame.current);
      outputRef.current = null;
      terminalRef.current = null;
      terminal.destroy();
    };
  }, []);

  useEffect(() => {
    syncOutput();
  }, [entries, i18n.resolvedLanguage]);

  useEffect(() => {
    applyTheme();
  }, [selectedTheme]);

  return (
    <TerminalCommandContext value={commandHandler}>
      <div
        data-terminal-output
        className="flex h-[calc(75dvh-8rem)] flex-col overflow-hidden rounded-md focus-within:ring-1 focus-within:ring-(--terminal-border)"
        style={{
          backgroundColor: colors.base.hex,
          color: colors.text.hex,
          "--term-selection-bg": `${colors.overlay2.hex}4d`,
          "--terminal-prompt": dark ? colors.green.hex : colors.text.hex,
          "--terminal-muted": colors.subtext1.hex,
          "--terminal-popup": colors.mantle.hex,
          "--terminal-active": dark ? colors.surface0.hex : colors.base.hex,
          "--terminal-border": colors.overlay2.hex,
        }}
      >
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pointer capture only clears the hover state; keyboard focus is handled by the links */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          onPointerDownCapture={(event) => {
            pointerDown.current = {
              x: event.clientX,
              y: event.clientY,
              uri: interactionAt(event.clientX, event.clientY),
              touch: event.pointerType === "touch",
            };
          }}
          onPointerMove={(event) => {
            const uri = event.buttons
              ? undefined
              : interactionAt(event.clientX, event.clientY);
            const host = hostRef.current;
            const row = host
              ? Math.floor(
                  (event.clientY -
                    host.getBoundingClientRect().top +
                    host.scrollTop -
                    metrics.current.top) /
                    metrics.current.height,
                )
              : -1;
            setHovered(
              runs.find((run) => run.uri === uri && run.row === row)?.key ??
                null,
            );
          }}
          onPointerLeave={() => {
            setHovered(null);
          }}
          onClickCapture={(event) => {
            if (
              (event.target instanceof HTMLElement &&
                event.target.closest("[data-terminal-jump]")) ||
              !event.detail ||
              event.detail > 1 ||
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey ||
              terminalRef.current?.getSelectionText() ||
              hostRef.current?.ownerDocument.getSelection()?.isCollapsed ===
                false
            )
              return;
            const down = pointerDown.current;
            const uri = interactionAt(event.clientX, event.clientY);
            const metadata = uri
              ? outputRef.current?.interactions.get(uri)
              : undefined;
            if (
              !metadata?.click ||
              !down ||
              down.uri !== uri ||
              Math.hypot(down.x - event.clientX, down.y - event.clientY) > 5
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            actions.activate(metadata);
          }}
          onClick={(event) => {
            const down = pointerDown.current;
            pointerDown.current = null;
            if (
              !children ||
              // Focusing the prompt after a tap opens the on-screen keyboard
              // and covers the log the reader was scrolling.
              down?.touch ||
              event.detail > 1 ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              terminalRef.current?.getSelectionText() ||
              hostRef.current?.ownerDocument.getSelection()?.isCollapsed ===
                false
            )
              return;
            event.currentTarget.parentElement
              ?.querySelector<HTMLInputElement>("[data-terminal-command] input")
              ?.focus({ preventScroll: true });
          }}
          onContextMenu={(event) => {
            const text = terminalRef.current?.getSelectionText();
            if (text) handleContextMenu(event, text);
          }}
          onMouseDownCapture={(event) => {
            if (event.button === 2 && terminalRef.current?.getSelectionText())
              event.preventDefault();
          }}
          onKeyDownCapture={(event) => {
            if (
              failed ||
              (event.target instanceof HTMLElement &&
                event.target.closest(
                  "[data-terminal-interaction], [data-terminal-jump]",
                ))
            )
              return;
            const terminal = terminalRef.current;
            const host = hostRef.current;
            if (!terminal || !host) return;
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === "c") return;
            event.stopPropagation();
            if ((event.ctrlKey || event.metaKey) && key === "a") {
              event.preventDefault();
              void terminal.selectAll();
            } else if (event.key === "Escape") {
              terminal.clearSelection();
              setHovered(null);
              setFocused(null);
            } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
              const delta = {
                ArrowUp: -16,
                ArrowDown: 16,
                PageUp: -host.clientHeight,
                PageDown: host.clientHeight,
                Home: -host.scrollHeight,
                End: host.scrollHeight,
              }[event.key];
              if (delta !== undefined) {
                event.preventDefault();
                host.scrollTop += delta;
              }
            }
          }}
        >
          {failed ? (
            <PlainTerminalOutput
              entries={entries}
              locale={toIntlLocale(i18n.resolvedLanguage)}
              onCommand={onCommand}
            />
          ) : (
            <section
              ref={hostRef}
              data-terminal-viewport
              // React replaces the whole class attribute when className changes,
              // which would drop the classes that wterm adds. Keep it static.
              data-hovered={hovered ? "" : undefined}
              className="px-3 py-2 select-text data-hovered:cursor-pointer"
              aria-label={t("pageName.terminal")}
              onScroll={(event) => {
                setHovered(null);
                scheduleInteractions();
                const host = event.currentTarget;
                if (host.scrollTop + host.clientHeight >= host.scrollHeight - 1)
                  setNewBelow(false);
              }}
            />
          )}
          {!failed && newBelow && (
            <Button
              data-terminal-jump
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-3 bottom-3 shadow-lg"
              onClick={(event) => {
                event.stopPropagation();
                const host = hostRef.current;
                if (host) host.scrollTop = host.scrollHeight;
                setNewBelow(false);
              }}
            >
              <ArrowDownIcon data-icon="inline-start" />
              {t("terminal.jumpToLatest")}
            </Button>
          )}
          {!failed &&
            runs.map((run) => {
              const description = actions.description(run.metadata.click);
              const tooltip = actions.tooltip(run.metadata);
              return (
                <Tooltip
                  key={run.key}
                  triggerId={`${interactionId}-${run.key}`}
                  onOpenChange={(open) => {
                    if (!open) {
                      setHovered(null);
                      setFocused(null);
                    }
                  }}
                  open={(hovered ?? focused) === run.key}
                >
                  <TooltipTrigger
                    // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the component renders its children inside this button, which gives it its text label
                    render={<button type="button" />}
                    data-terminal-interaction
                    id={`${interactionId}-${run.key}`}
                    className="pointer-events-none absolute top-(--interaction-top) left-(--interaction-left) h-(--term-row-height) w-(--interaction-width) focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--terminal-prompt)"
                    style={{
                      "--interaction-top": `${metrics.current.top + run.row * metrics.current.height - (hostRef.current?.scrollTop ?? 0)}px`,
                      "--interaction-left": `${metrics.current.left + run.col * metrics.current.width - (hostRef.current?.scrollLeft ?? 0)}px`,
                      "--interaction-width": `${run.width * metrics.current.width}px`,
                      "--term-row-height": `${metrics.current.height}px`,
                    }}
                    aria-label={[run.text, description]
                      .filter(Boolean)
                      .join(". ")}
                    aria-describedby={
                      (hovered ?? focused) === run.key
                        ? `${interactionId}-${run.key}-tooltip`
                        : undefined
                    }
                    aria-disabled={
                      actions.disabled(run.metadata.click) ? true : undefined
                    }
                    onFocus={() => {
                      setFocused(run.key);
                    }}
                    onBlur={() => {
                      setFocused(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setFocused(null);
                        setHovered(null);
                      }
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      event.stopPropagation();
                      actions.activate(run.metadata);
                    }}
                  >
                    <span className="sr-only">{run.text}</span>
                  </TooltipTrigger>
                  <TooltipContent
                    role="tooltip"
                    id={`${interactionId}-${run.key}-tooltip`}
                  >
                    <span className="break-all whitespace-pre-wrap">
                      {tooltip}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
        </div>
        {children && (
          <div data-terminal-command className="shrink-0 p-1">
            {children}
          </div>
        )}
      </div>
      {contextMenu && (
        <ContextMenuPortal
          menuRef={menuRef}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          onClose={dismiss}
        >
          <SelectedTextActions text={contextMenu.data} onClose={dismiss} />
        </ContextMenuPortal>
      )}
    </TerminalCommandContext>
  );
}

export function TerminalComponent({
  scope,
  children,
}: {
  scope: LogScope;
  children?: ReactNode;
}) {
  const { t } = useTranslation("common");
  const transport = use(TransportContext);
  const demo = isDemo();
  const {
    entries: liveEntries,
    historyLoaded,
    denied,
  } = useTerminalLogs(demo ? null : transport, scope);
  // Read-only views, such as the logs page, have no command prompt.
  const readOnly = !children;
  const entries = demo
    ? [1, 2, 3, 4].map((id) =>
        toTerminalLine({
          id: `demo-${id}`,
          message: t(`terminal.demo-${id}`),
          personal: false,
        }),
      )
    : denied
      ? // Replies to this user's own commands can still arrive, so keep them
        // below the notice.
        [
          toTerminalLine({
            id: "denied",
            message: t("terminal.logsDenied"),
            personal: false,
          }),
          ...liveEntries,
        ]
      : liveEntries.length === 0 && historyLoaded
        ? [
            toTerminalLine({
              id: "empty",
              message: t(
                readOnly ? "terminal.noLogsReadOnly" : "terminal.noLogs",
              ),
              personal: false,
            }),
          ]
        : liveEntries;
  const terminalTheme = useTerminalThemeContext();

  return (
    <TerminalView entries={entries} theme={terminalTheme.value}>
      {children}
    </TerminalView>
  );
}

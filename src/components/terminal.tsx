import { flavorEntries } from "@catppuccin/palette";
import { WTerm } from "@wterm/dom";
import { stripAnsi } from "fancy-ansi";
import {
  type CSSProperties,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal";
import { SelectedTextActions } from "@/components/custom-context-menu";
import { TerminalThemeContext } from "@/components/providers/terminal-theme-context";
import { TransportContext } from "@/components/providers/transport-context";
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
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  terminalInteractionAt,
  visibleTerminalInteractions,
  type TerminalInteractionRun,
} from "@/lib/terminal-interaction-cells";
import type { TerminalInteraction } from "@/lib/terminal-interactions";
import { useContextMenu } from "@/hooks/use-context-menu";
import { useTerminalLogs } from "@/hooks/use-terminal-logs";
import {
  createTerminalOutput,
  formatTerminalLine,
} from "@/lib/terminal-output";
import { isDemo, openExternalUrl } from "@/lib/utils";
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
  const copy = useCopyToClipboard();
  const [runs, setRuns] = useState<TerminalInteractionRun[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const pointerDown = useRef<{ x: number; y: number; uri?: string } | null>(
    null,
  );
  const interactionFrame = useRef(0);
  const metrics = useRef({ width: 0, height: 0, top: 0, left: 0 });

  const updateInteractions = useEffectEvent(() => {
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
  });
  const scheduleInteractions = () => {
    cancelAnimationFrame(interactionFrame.current);
    interactionFrame.current = requestAnimationFrame(() =>
      updateInteractions(),
    );
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
  const activate = (metadata: TerminalInteraction) => {
    const click = metadata.click;
    if (!click) return;
    if (click.action === "copy_to_clipboard") copy(click.value);
    else if (click.action === "open_url") openExternalUrl(click.value);
    else commandHandler.current?.(click.action, click.value);
  };
  const scrollFrame = useRef(0);
  const [failed, setFailed] = useState(false);
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<string>();
  const selectedTheme =
    flavorEntries.find(([name]) => name === theme)?.[1] ?? flavorEntries[0][1];
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
      palette: palette.map((color) => rgb(color.hex)),
    });
  });

  const syncOutput = useEffectEvent((resized = false) => {
    const host = hostRef.current;
    const output = outputRef.current;
    if (!host || !output) return;
    const top = host.scrollTop;
    const atBottom = top + host.clientHeight >= host.scrollHeight - 1;
    const update = output.sync(entries, i18n.resolvedLanguage, resized);
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
    if (!host) return;
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
        className="flex h-[calc(75vh-8rem)] flex-col overflow-hidden rounded-md focus-within:ring-1 focus-within:ring-(--terminal-border)"
        style={
          {
            backgroundColor: colors.base.hex,
            color: colors.text.hex,
            "--term-selection-bg": `${colors.overlay2.hex}80`,
            "--terminal-prompt": dark ? colors.green.hex : colors.text.hex,
            "--terminal-muted": colors.subtext1.hex,
            "--terminal-popup": colors.mantle.hex,
            "--terminal-active": dark ? colors.surface0.hex : colors.base.hex,
            "--terminal-border": colors.surface2.hex,
          } as CSSProperties
        }
      >
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          onPointerDownCapture={(event) => {
            pointerDown.current = {
              x: event.clientX,
              y: event.clientY,
              uri: interactionAt(event.clientX, event.clientY),
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
          onPointerLeave={() => setHovered(null)}
          onClickCapture={(event) => {
            if (
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
            pointerDown.current = null;
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
            activate(metadata);
          }}
          onClick={(event) => {
            if (
              !children ||
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
                event.target.closest("[data-terminal-interaction]"))
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
            <pre className="h-full overflow-auto p-1 font-mono text-xs whitespace-pre-wrap break-all select-text">
              {entries
                .map((entry) =>
                  stripAnsi(formatTerminalLine(entry, i18n.resolvedLanguage)),
                )
                .join("")}
            </pre>
          ) : (
            <div
              ref={hostRef}
              data-terminal-viewport
              className={hovered ? "cursor-pointer select-text" : "select-text"}
              aria-label={t("pageName.terminal")}
              onScroll={() => {
                setHovered(null);
                scheduleInteractions();
              }}
            />
          )}
          {!failed &&
            runs.map((run) => {
              const click = run.metadata.click;
              const command =
                click?.action === "run_command" ||
                click?.action === "suggest_command";
              const description = click
                ? t(`terminal.actions.${click.action}`, { value: click.value })
                : "";
              const tooltip = [
                run.metadata.hover,
                description,
                command && !children ? t("terminal.actions.unavailable") : "",
              ]
                .filter(Boolean)
                .join("\n");
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
                    render={<button type="button" />}
                    data-terminal-interaction
                    id={`${interactionId}-${run.key}`}
                    className="pointer-events-none absolute top-(--interaction-top) left-(--interaction-left) h-(--term-row-height) w-(--interaction-width) focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--terminal-prompt)"
                    style={
                      {
                        "--interaction-top": `${metrics.current.top + run.row * metrics.current.height - (hostRef.current?.scrollTop ?? 0)}px`,
                        "--interaction-left": `${metrics.current.left + run.col * metrics.current.width - (hostRef.current?.scrollLeft ?? 0)}px`,
                        "--interaction-width": `${run.width * metrics.current.width}px`,
                        "--term-row-height": `${metrics.current.height}px`,
                      } as CSSProperties
                    }
                    aria-label={[run.text, description]
                      .filter(Boolean)
                      .join(". ")}
                    aria-describedby={
                      (hovered ?? focused) === run.key
                        ? `${interactionId}-${run.key}-tooltip`
                        : undefined
                    }
                    aria-disabled={
                      !click || (command && !children) ? true : undefined
                    }
                    onFocus={() => setFocused(run.key)}
                    onBlur={() => setFocused(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setFocused(null);
                        setHovered(null);
                      }
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) activate(run.metadata);
                    }}
                  >
                    <span className="sr-only">{run.text}</span>
                  </TooltipTrigger>
                  <TooltipContent
                    role="tooltip"
                    id={`${interactionId}-${run.key}-tooltip`}
                  >
                    <span className="whitespace-pre-wrap break-all">
                      {tooltip}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
        </div>
        {children && (
          <div data-terminal-command className="shrink-0 px-1 py-1">
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
  const { entries: liveEntries, historyLoaded } = useTerminalLogs(
    demo ? null : transport,
    scope,
  );
  const entries = demo
    ? [1, 2, 3, 4].map((id) =>
        toTerminalLine({
          id: `demo-${id}`,
          message: t(`terminal.demo-${id}`),
          personal: false,
        }),
      )
    : liveEntries.length === 0 && historyLoaded
      ? [
          toTerminalLine({
            id: "empty",
            message: t("terminal.noLogs"),
            personal: false,
          }),
        ]
      : liveEntries;
  const terminalTheme = use(TerminalThemeContext);

  return (
    <TerminalView entries={entries} theme={terminalTheme.value}>
      {children}
    </TerminalView>
  );
}

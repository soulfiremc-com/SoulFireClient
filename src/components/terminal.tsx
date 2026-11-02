import { flavorEntries } from "@catppuccin/palette";
import { WTerm } from "@wterm/dom";
import { stripAnsi } from "fancy-ansi";
import {
  type CSSProperties,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal";
import { SelectedTextActions } from "@/components/custom-context-menu";
import { TerminalThemeContext } from "@/components/providers/terminal-theme-context";
import { TransportContext } from "@/components/providers/transport-context";
import type { LogScope } from "@/generated/soulfire/logs_pb";
import { useContextMenu } from "@/hooks/use-context-menu";
import { useTerminalLogs } from "@/hooks/use-terminal-logs";
import {
  createTerminalOutput,
  formatTerminalLine,
} from "@/lib/terminal-output";
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
    if (update.reset && !atBottom) {
      const rowHeight = Number.parseFloat(
        getComputedStyle(host).getPropertyValue("--term-row-height"),
      );
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => {
        host.scrollTop = Math.max(0, top + update.rowShift * rowHeight);
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
    <>
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
          className="min-h-0 flex-1"
          onClick={(event) => {
            if (
              !children ||
              event.detail > 1 ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              terminalRef.current?.getSelectionText()
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
            if (failed) return;
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
              className="select-text"
              aria-label={t("pageName.terminal")}
            />
          )}
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
    </>
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

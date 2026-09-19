import { flavorEntries } from "@catppuccin/palette";
import type { LogScope } from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import { stripAnsi } from "fancy-ansi";
import { AnsiHtml } from "fancy-ansi/react";
import { ClipboardIcon, CloudUploadIcon } from "lucide-react";
import React, {
  type CSSProperties,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TerminalThemeContext } from "@/components/providers/terminal-theme-context.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useTerminalLogs } from "@/hooks/use-terminal-logs";
import { cn, isDemo, timestampToDate, uploadToMcLogs } from "@/lib/utils.tsx";
import { type TerminalLine, toTerminalLine } from "@/stores/terminal-log-store";
import { TransportContext } from "./providers/transport-context.tsx";
import { Button } from "./ui/button.tsx";
import { ScrollArea } from "./ui/scroll-area.tsx";

// Use full logger name unless if
// prefixed with com.soulfiremc then use only the last part
function formatLoggerName(name: string | undefined): string | undefined {
  if (name?.startsWith("com.soulfiremc.")) {
    const parts = name.split(".");
    return parts[parts.length - 1];
  } else {
    return name;
  }
}

function isImportantLog(level: string | undefined): boolean {
  if (level === undefined) {
    return false;
  }

  const importantLevels = ["ERROR", "WARN", "FATAL"];
  return importantLevels.includes(level.toUpperCase());
}

const MemoAnsiHtml = React.memo(
  ({
    content,
  }: {
    content: Pick<
      TerminalLine,
      | "message"
      | "level"
      | "timestamp"
      | "loggerName"
      | "instanceName"
      | "botAccountName"
    >;
  }) => {
    const copyToClipboard = useCopyToClipboard();
    const { t, i18n } = useTranslation();

    return (
      <span className="w-full hover:bg-(--terminal-selection-bg)/25">
        <span
          className={cn({
            "text-(--ansi-yellow)": content.level === "WARN",
            "text-(--ansi-red)":
              content.level === "ERROR" || content.level === "FATAL",
          })}
        >
          <span>{content.level}</span>
          {content.timestamp && (
            <>
              <span>{"\u0020"}</span>
              <span>
                {timestampToDate(content.timestamp).toLocaleTimeString(
                  i18n.resolvedLanguage,
                )}
              </span>
            </>
          )}
          {content.instanceName && (
            <>
              <span>{"\u0020"}</span>
              <span>
                {content.instanceName}
                {content.botAccountName ? `:${content.botAccountName}` : ""}
              </span>
            </>
          )}
          <span>{"\u0020"}</span>
          <span>{formatLoggerName(content.loggerName)}</span>
          <span>{"\u0020"}</span>
        </span>
        <AnsiHtml
          text={
            stripAnsi(content.message).endsWith("\n")
              ? content.message
              : `${content.message}\n`
          }
        />
        {isImportantLog(content.level) && (
          <>
            <span className="select-none">{"\u0020"}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-fit px-0 select-none size-3"
              onClick={() => {
                copyToClipboard(stripAnsi(content.message));
              }}
              title={t("copyToClipboard")}
            >
              <ClipboardIcon />
            </Button>
            <span className="select-none">{"\u0020"}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-fit px-0 select-none size-3"
              onClick={() => {
                toast.promise(
                  uploadToMcLogs(stripAnsi(content.message)).then(
                    (response) => {
                      if (response.success) {
                        copyToClipboard(response.url);
                        return response.url;
                      } else {
                        throw new Error(`Upload failed: ${response.error}`);
                      }
                    },
                  ),
                  {
                    loading: t("mcLogsUpload.loading"),
                    success: (url) => t("mcLogsUpload.success", { url }),
                    error: t("mcLogsUpload.error"),
                  },
                );
              }}
              title={t("uploadToMcLogs")}
            >
              <CloudUploadIcon />
            </Button>
          </>
        )}
      </span>
    );
  },
);

export const TerminalComponent = (props: { scope: LogScope }) => {
  const { t } = useTranslation("common");
  const transport = use(TransportContext);
  const demo = isDemo();
  const { entries: liveEntries, historyLoaded } = useTerminalLogs(
    demo ? null : transport,
    props.scope,
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
  const paneRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const selectedTheme =
    flavorEntries.find((entry) => entry[0] === terminalTheme.value)?.[1] ||
    flavorEntries[0][1];

  const handleScroll = useCallback(() => {
    if (paneRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = paneRef.current;
      setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 1);
    }
  }, []);

  useEffect(() => {
    const pane = paneRef.current;
    if (pane) {
      pane.addEventListener("scroll", handleScroll);
      return () => {
        pane.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  useEffect(() => {
    if (isAtBottom && paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight;
    }
  }, [isAtBottom]);

  return (
    <ScrollArea
      viewportRef={paneRef}
      viewportClassName="overscroll-contain"
      className="h-[calc(75vh-8rem)] rounded-md pr-4 font-mono text-xs"
      style={
        {
          backgroundColor: selectedTheme.colors.base.hex,
          color: selectedTheme.colors.text.hex,
          "--color-border": `${selectedTheme.colors.surface2.hex}80`, // Add 50% opacity
          "--ansi-black": selectedTheme.dark
            ? selectedTheme.colors.surface1.hex
            : selectedTheme.colors.subtext1.hex,
          "--ansi-red": selectedTheme.colors.red.hex,
          "--ansi-green": selectedTheme.colors.green.hex,
          "--ansi-yellow": selectedTheme.colors.yellow.hex,
          "--ansi-blue": selectedTheme.colors.blue.hex,
          "--ansi-magenta": selectedTheme.colors.pink.hex,
          "--ansi-cyan": selectedTheme.colors.teal.hex,
          "--ansi-white": selectedTheme.dark
            ? selectedTheme.colors.subtext0.hex
            : selectedTheme.colors.surface2.hex,
          "--ansi-bright-black": selectedTheme.dark
            ? selectedTheme.colors.surface2.hex
            : selectedTheme.colors.subtext0.hex,
          "--ansi-bright-red": selectedTheme.colors.red.hex,
          "--ansi-bright-green": selectedTheme.colors.green.hex,
          "--ansi-bright-yellow": selectedTheme.colors.yellow.hex,
          "--ansi-bright-blue": selectedTheme.colors.blue.hex,
          "--ansi-bright-magenta": selectedTheme.colors.pink.hex,
          "--ansi-bright-cyan": selectedTheme.colors.teal.hex,
          "--ansi-bright-white": selectedTheme.dark
            ? selectedTheme.colors.subtext1.hex
            : selectedTheme.colors.surface1.hex,
          "--terminal-selection-bg": selectedTheme.colors.overlay2.hex,
        } as CSSProperties
      }
    >
      <p className="h-full flex flex-col min-h-[calc(75vh-8rem)] cursor-text py-0.5 pl-0.5 break-all whitespace-pre-wrap select-text selection:bg-(--terminal-selection-bg)/25">
        {entries.map((entry) => {
          return (
            <MemoAnsiHtml
              key={entry.id}
              content={{
                message: entry.message,
                level: entry.level,
                timestamp: entry.timestamp,
                loggerName: entry.loggerName,
                instanceName: entry.instanceName,
                botAccountName: entry.botAccountName,
              }}
            />
          );
        })}
      </p>
    </ScrollArea>
  );
};

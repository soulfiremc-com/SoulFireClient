import { TrashIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { cn } from "@/lib/utils.tsx";
import type { LogEntry, LogLevel } from "./types.ts";

interface ExecutionLogsProps {
  logs: LogEntry[];
  onClearLogs?: () => void;
  autoScroll?: boolean;
  className?: string;
}

function getLogLevelStyles(level: LogLevel): {
  badge: "default" | "secondary" | "destructive" | "outline";
  text: string;
} {
  switch (level) {
    case "debug":
      return { badge: "secondary", text: "text-muted-foreground" };
    case "info":
      return { badge: "default", text: "text-foreground" };
    case "warn":
      return { badge: "outline", text: "text-warning-emphasis" };
    case "error":
      return { badge: "destructive", text: "text-destructive" };
    default:
      return { badge: "default", text: "text-foreground" };
  }
}

function formatTimestamp(date: Date): string {
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${timeStr}.${ms}`;
}

interface LogEntryRowProps {
  entry: LogEntry;
}

function LogEntryRow({ entry }: LogEntryRowProps) {
  const styles = getLogLevelStyles(entry.level);

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-border/50 px-3 py-2 font-mono text-xs last:border-0",
        styles.text,
      )}
    >
      <span className="shrink-0 text-muted-foreground">
        {formatTimestamp(entry.timestamp)}
      </span>
      <Badge variant={styles.badge} className="shrink-0 uppercase">
        {entry.level}
      </Badge>
      {entry.nodeId && (
        <span className="shrink-0 text-muted-foreground">[{entry.nodeId}]</span>
      )}
      <span className="flex-1 break-all">{entry.message}</span>
    </div>
  );
}

export function ExecutionLogs({
  logs,
  onClearLogs,
  autoScroll = true,
  className,
}: ExecutionLogsProps) {
  const { t } = useTranslation("instance");
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (autoScroll && scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop =
        scrollViewportRef.current.scrollHeight;
    }
  }, [autoScroll]);

  return (
    <div
      className={cn(
        "flex h-full flex-col border-t border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">
            {t("scripts.editor.logs.title")}
          </h2>
          <span className="text-xs text-muted-foreground">
            ({t("scripts.editor.logs.entries", { count: logs.length })})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClearLogs}
          disabled={logs.length === 0}
          title={t("scripts.editor.logs.clearTitle")}
        >
          <TrashIcon className="size-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportRef={scrollViewportRef}>
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-center text-xs text-muted-foreground">
              {t("scripts.editor.logs.noLogs")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {logs.map((entry) => (
              <LogEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

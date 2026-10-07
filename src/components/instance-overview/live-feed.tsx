import { createClient } from "@connectrpc/connect";
import { PauseIcon, PlayIcon } from "lucide-react";
import { use, useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { BotLifecycleKind } from "@/generated/soulfire/bot_live_pb";
import {
  type InstanceEvent,
  InstanceLiveService,
} from "@/generated/soulfire/instance_live_pb";
import { observeServerStream } from "@/lib/protobuf.ts";
import { cn, timestampToDate } from "@/lib/utils.tsx";

const MAX_FEED_ENTRIES = 200;
const FEED_COLUMNS =
  "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5.5rem_7.5rem_minmax(0,1fr)]";
type FeedFilter = "all" | "chat" | "lifecycle";
type FeedEntry = {
  id: number;
  botName: string;
  timestamp: Date;
} & (
  | { kind: "chat"; senderName?: string; text: string }
  | {
      kind: "lifecycle";
      lifecycleKind: BotLifecycleKind;
      message?: string;
    }
);

function lifecycleText(
  t: (key: string) => string,
  kind: BotLifecycleKind,
  message: string | undefined,
): string {
  switch (kind) {
    case BotLifecycleKind.BOT_LIFECYCLE_CONNECTING:
      return t("overview.liveFeed.lifecycle.connecting");
    case BotLifecycleKind.BOT_LIFECYCLE_CONNECTED:
      return t("overview.liveFeed.lifecycle.connected");
    case BotLifecycleKind.BOT_LIFECYCLE_SPAWNED:
      return t("overview.liveFeed.lifecycle.spawned");
    case BotLifecycleKind.BOT_LIFECYCLE_DIED:
      return message
        ? `${t("overview.liveFeed.lifecycle.died")}: ${message}`
        : t("overview.liveFeed.lifecycle.died");
    case BotLifecycleKind.BOT_LIFECYCLE_RESPAWNED:
      return t("overview.liveFeed.lifecycle.respawned");
    case BotLifecycleKind.BOT_LIFECYCLE_DISCONNECTED:
      return message
        ? `${t("overview.liveFeed.lifecycle.disconnected")}: ${message}`
        : t("overview.liveFeed.lifecycle.disconnected");
    default:
      return t("overview.liveFeed.lifecycle.unknown");
  }
}

export function LiveFeed({
  instanceId,
  canWatch,
}: {
  instanceId: string;
  canWatch: boolean;
}) {
  const { t, i18n } = useTranslation("instance");
  const transport = use(TransportContext);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [pausedEntries, setPausedEntries] = useState<FeedEntry[] | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [reconnecting, setReconnecting] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const nextIdRef = useRef(0);
  const displayedEntries = pausedEntries ?? entries;
  const visibleEntries = displayedEntries.filter(
    (entry) => filter === "all" || entry.kind === filter,
  );
  const timeFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const receiveEvent = useEffectEvent((event: InstanceEvent) => {
    setReconnecting(false);
    if (event.event.case !== "chat" && event.event.case !== "lifecycle") return;
    const timestamp =
      event.event.case === "chat" && event.event.value.receivedAt
        ? timestampToDate(event.event.value.receivedAt)
        : new Date();
    const entry: FeedEntry =
      event.event.case === "chat"
        ? {
            id: nextIdRef.current++,
            botName: event.botName,
            timestamp,
            kind: "chat",
            senderName: event.event.value.senderName,
            text: event.event.value.plainText,
          }
        : {
            id: nextIdRef.current++,
            botName: event.botName,
            timestamp,
            kind: "lifecycle",
            lifecycleKind: event.event.value.kind,
            message: event.event.value.message,
          };
    setEntries((previous) => [...previous, entry].slice(-MAX_FEED_ENTRIES));
  });

  useEffect(() => {
    if (!canWatch || transport === null) return;
    const controller = new AbortController();
    const service = createClient(InstanceLiveService, transport);
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    function retry(delay: number) {
      if (controller.signal.aborted) return;
      setReconnecting(true);
      retryTimer = setTimeout(connect, delay);
    }
    function connect() {
      if (controller.signal.aborted) return;
      const responses = service.watchInstanceEvents(
        { instanceId, filter: { includeChat: true, includeLifecycle: true } },
        { signal: controller.signal },
      );
      void observeServerStream(responses, {
        onMessage: receiveEvent,
        onError: () => retry(3_000),
        onComplete: () => retry(1_000),
      });
    }
    connect();
    return () => {
      controller.abort();
      clearTimeout(retryTimer);
    };
  }, [instanceId, transport, canWatch]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && followingRef.current && pausedEntries === null)
      viewport.scrollTop = viewport.scrollHeight;
  }, [entries, pausedEntries, filter]);

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-labelledby="overview-feed-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="overview-feed-title" className="text-sm font-medium">
          {t("overview.liveFeed.title")}
        </h3>
        {canWatch && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={pausedEntries !== null}
            onClick={() => {
              followingRef.current = true;
              setPausedEntries(pausedEntries === null ? entries : null);
            }}
          >
            {pausedEntries === null ? (
              <PauseIcon data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            {t(
              pausedEntries === null
                ? "overview.liveFeed.pause"
                : "overview.liveFeed.resume",
            )}
          </Button>
        )}
      </div>
      <div className="bg-card overflow-hidden rounded-md border">
        <div className="flex flex-col gap-5 px-3 pt-3 sm:px-4 sm:pt-4">
          <ToggleGroup
            size="sm"
            spacing={1}
            value={[filter]}
            disabled={!canWatch}
            aria-label={t("overview.liveFeed.filterLabel")}
            onValueChange={(values) => {
              const next = values[0];
              if (next === "all" || next === "chat" || next === "lifecycle") {
                followingRef.current = true;
                setFilter(next);
              }
            }}
          >
            <ToggleGroupItem value="all">
              {t("overview.liveFeed.filters.all")}
            </ToggleGroupItem>
            <ToggleGroupItem value="chat">
              {t("overview.liveFeed.filters.chat")}
            </ToggleGroupItem>
            <ToggleGroupItem value="lifecycle">
              {t("overview.liveFeed.filters.lifecycle")}
            </ToggleGroupItem>
          </ToggleGroup>
          <div
            className={cn(FEED_COLUMNS, "text-muted-foreground pr-3 text-xs")}
            aria-hidden="true"
          >
            <span className="hidden sm:block">
              {t("overview.liveFeed.columns.time")}
            </span>
            <span>{t("overview.liveFeed.columns.bot")}</span>
            <span>{t("overview.liveFeed.columns.message")}</span>
          </div>
        </div>
        <ScrollArea
          viewportRef={viewportRef}
          className={cn(
            displayedEntries.length > 0 ? "h-80 sm:h-96 xl:h-[26rem]" : "h-48",
          )}
          onScrollCapture={() => {
            const viewport = viewportRef.current;
            if (viewport)
              followingRef.current =
                viewport.scrollHeight -
                  viewport.scrollTop -
                  viewport.clientHeight <
                32;
          }}
        >
          {canWatch && visibleEntries.length > 0 ? (
            <ol
              aria-label={t("overview.liveFeed.title")}
              className="flex flex-col gap-2 px-3 pt-4 font-mono text-xs leading-5 sm:px-4"
            >
              {visibleEntries.map((entry) => (
                <li key={entry.id} className={FEED_COLUMNS}>
                  <time
                    dateTime={entry.timestamp.toISOString()}
                    className="text-muted-foreground hidden tabular-nums sm:block"
                  >
                    {timeFormatter.format(entry.timestamp)}
                  </time>
                  <span
                    className="text-muted-foreground truncate"
                    title={entry.botName}
                  >
                    {entry.botName || "-"}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 whitespace-pre-wrap wrap-anywhere pr-3",
                      entry.kind === "lifecycle" && "text-muted-foreground",
                    )}
                  >
                    {entry.kind === "chat" ? (
                      <>
                        {entry.senderName && (
                          <span className="font-medium">
                            {entry.senderName}:{" "}
                          </span>
                        )}
                        {entry.text}
                      </>
                    ) : (
                      lifecycleText(t, entry.lifecycleKind, entry.message)
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty className="min-h-48">
              <EmptyHeader>
                <EmptyDescription>
                  {t(
                    !canWatch
                      ? "overview.liveFeed.noPermission"
                      : displayedEntries.length === 0
                        ? "overview.liveFeed.empty"
                        : "overview.liveFeed.emptyFilter",
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
        {canWatch && (
          <div className="text-muted-foreground px-3 py-3 text-xs sm:px-4">
            {t(
              pausedEntries !== null
                ? "overview.liveFeed.paused"
                : reconnecting
                  ? "overview.liveFeed.reconnecting"
                  : "overview.liveFeed.following",
            )}
          </div>
        )}
      </div>
    </section>
  );
}

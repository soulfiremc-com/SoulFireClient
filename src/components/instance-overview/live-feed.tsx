import { useAtomValue } from "@effect/atom-react";
import type { TFunction } from "i18next";
import { PauseIcon, PlayIcon } from "lucide-react";
import { memo, use, useEffect, useMemo, useRef, useState } from "react";
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
import { toIntlLocale } from "@/lib/intl-locale.ts";
import { cn } from "@/lib/utils.tsx";
import { liveFeedAtom } from "./live-feed-atom.ts";
import type { FeedEntry } from "./live-feed-buffer.ts";

const FEED_COLUMNS =
  "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5.5rem_7.5rem_minmax(0,1fr)]";
type FeedFilter = "all" | "chat" | "lifecycle";
/** Limits the bot list in the tooltip of a line many bots received. */
const MAX_TITLE_BOTS = 20;

function lifecycleText(
  t: TFunction<"instance">,
  kind: BotLifecycleKind,
  message: string | undefined,
): string {
  switch (kind) {
    case BotLifecycleKind.BOT_LIFECYCLE_CONNECTING: {
      return t("overview.liveFeed.lifecycle.connecting");
    }
    case BotLifecycleKind.BOT_LIFECYCLE_CONNECTED: {
      return t("overview.liveFeed.lifecycle.connected");
    }
    case BotLifecycleKind.BOT_LIFECYCLE_SPAWNED: {
      return t("overview.liveFeed.lifecycle.spawned");
    }
    case BotLifecycleKind.BOT_LIFECYCLE_DIED: {
      return message
        ? t("overview.liveFeed.lifecycle.diedWithReason", { reason: message })
        : t("overview.liveFeed.lifecycle.died");
    }
    case BotLifecycleKind.BOT_LIFECYCLE_RESPAWNED: {
      return t("overview.liveFeed.lifecycle.respawned");
    }
    case BotLifecycleKind.BOT_LIFECYCLE_DISCONNECTED: {
      return message
        ? t("overview.liveFeed.lifecycle.disconnectedWithReason", {
            reason: message,
          })
        : t("overview.liveFeed.lifecycle.disconnected");
    }
    case BotLifecycleKind.BOT_LIFECYCLE_UNSPECIFIED:
    default: {
      return t("overview.liveFeed.lifecycle.unknown");
    }
  }
}

/** Rows only re-render when their entry changes, not on every new line. */
const FeedRow = memo(function FeedRow({
  entry,
  timeFormatter,
}: {
  entry: FeedEntry;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation("instance");
  const [firstBot = ""] = entry.botNames;
  const manyBots = entry.botNames.length > 1;
  return (
    <li className={FEED_COLUMNS}>
      <time
        dateTime={entry.timestamp.toISOString()}
        className="hidden text-muted-foreground tabular-nums sm:block"
      >
        {timeFormatter.format(entry.timestamp)}
      </time>
      <span
        className="truncate text-muted-foreground"
        title={
          manyBots
            ? entry.botNames.slice(0, MAX_TITLE_BOTS).join(", ")
            : firstBot
        }
      >
        {manyBots
          ? t("overview.liveFeed.botCount", { count: entry.botNames.length })
          : firstBot || "-"}
      </span>
      <span
        className={cn(
          "min-w-0 pr-3 wrap-anywhere whitespace-pre-wrap",
          entry.kind === "lifecycle" && "text-muted-foreground",
        )}
      >
        {entry.kind === "chat" ? (
          <>
            {entry.senderName && (
              <span className="font-medium">{entry.senderName}: </span>
            )}
            {entry.text}
          </>
        ) : (
          lifecycleText(t, entry.lifecycleKind, entry.message)
        )}
      </span>
    </li>
  );
});

export function LiveFeed({
  instanceId,
  canWatch,
  botName,
  title,
}: {
  instanceId: string;
  canWatch: boolean;
  /** Shows only this bot's events, for the bot detail page. */
  botName?: string;
  title?: string;
}) {
  const { t, i18n } = useTranslation("instance");
  const transport = use(TransportContext);
  const { entries, reconnecting } = useAtomValue(
    liveFeedAtom(canWatch ? transport : null, instanceId, botName),
  );
  const [pausedEntries, setPausedEntries] = useState<
    readonly FeedEntry[] | null
  >(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const viewportRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const displayedEntries = pausedEntries ?? entries;
  const visibleEntries = useMemo(
    () =>
      filter === "all"
        ? displayedEntries
        : displayedEntries.filter((entry) => entry.kind === filter),
    [displayedEntries, filter],
  );
  const locale = toIntlLocale(i18n.resolvedLanguage);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [locale],
  );

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
          {title ?? t("overview.liveFeed.title")}
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
      <div className="overflow-hidden rounded-md border bg-card">
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
            className={cn(FEED_COLUMNS, "pr-3 text-xs text-muted-foreground")}
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
            displayedEntries.length > 0
              ? botName === undefined
                ? "h-80 sm:h-96 xl:h-104"
                : "h-64"
              : "h-48",
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
              className="flex flex-col gap-2 px-3 pt-4 font-mono text-xs/5 sm:px-4"
            >
              {visibleEntries.map((entry) => (
                <FeedRow
                  key={entry.id}
                  entry={entry}
                  timeFormatter={timeFormatter}
                />
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
          <div className="p-3 text-xs text-muted-foreground sm:px-4">
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

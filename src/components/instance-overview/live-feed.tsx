import { createClient } from "@connectrpc/connect";
import { RadioTowerIcon } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import type { Timestamp } from "@/generated/google/protobuf/timestamp_pb.ts";
import { BotLifecycleKind } from "@/generated/soulfire/bot_live_pb.ts";
import { InstanceLiveService } from "@/generated/soulfire/instance_live_pb.ts";
import { observeServerStream } from "@/lib/protobuf.ts";
import { cn, timestampToDate } from "@/lib/utils.tsx";

const MAX_FEED_ENTRIES = 200;

type FeedEntry = {
  id: number;
  botName: string;
  kind: "chat" | "lifecycle";
  senderName?: string;
  text: string;
  timestamp?: Timestamp;
};

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

/// Live instance activity feed. Subscribes to the instance-wide event stream
/// and renders chat and connection-lifecycle events as they happen.
export function LiveFeed({
  instanceId,
  canWatch,
}: {
  instanceId: string;
  canWatch: boolean;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    if (!canWatch || transport === null) {
      return;
    }

    const abortController = new AbortController();

    function connect() {
      if (transport === null) {
        return;
      }

      const service = createClient(InstanceLiveService, transport);
      const responses = service.watchInstanceEvents(
        {
          instanceId,
          filter: { includeChat: true, includeLifecycle: true },
        },
        { signal: abortController.signal },
      );

      void observeServerStream(responses, {
        onMessage: (event) => {
          if (event.event.case === undefined) {
            return;
          }

          const entry: FeedEntry =
            event.event.case === "chat"
              ? {
                  id: nextIdRef.current++,
                  botName: event.botName,
                  kind: "chat",
                  senderName: event.event.value.senderName,
                  text: event.event.value.plainText,
                  timestamp: event.event.value.receivedAt,
                }
              : {
                  id: nextIdRef.current++,
                  botName: event.botName,
                  kind: "lifecycle",
                  text: lifecycleText(
                    t,
                    event.event.value.kind,
                    event.event.value.message,
                  ),
                };

          setEntries((prev) => [...prev, entry].slice(-MAX_FEED_ENTRIES));
        },
        onError: () => {
          if (abortController.signal.aborted) return;
          setTimeout(connect, 3_000);
        },
        onComplete: () => {
          if (abortController.signal.aborted) return;
          setTimeout(connect, 1_000);
        },
      });
    }

    connect();
    return () => abortController.abort();
  }, [instanceId, transport, canWatch, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run to keep the feed pinned to the latest entry
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [entries]);

  return (
    <Card size="sm" className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <RadioTowerIcon className="size-4" />
          {t("overview.liveFeed.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {!canWatch ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("overview.liveFeed.noPermission")}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("overview.liveFeed.empty")}
          </p>
        ) : (
          <ScrollArea viewportRef={viewportRef} className="h-56">
            <div className="flex flex-col gap-1 pr-3 text-xs">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "flex gap-2 break-words",
                    entry.kind === "lifecycle" &&
                      "text-muted-foreground italic",
                  )}
                >
                  {entry.timestamp && (
                    <span className="text-muted-foreground/70 shrink-0 font-mono">
                      {timestampToDate(entry.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                  <span className="min-w-0">
                    {entry.botName && (
                      <span className="text-muted-foreground/70 mr-1">
                        [{entry.botName}]
                      </span>
                    )}
                    {entry.senderName && (
                      <span className="text-primary mr-1 font-medium">
                        {entry.senderName}:
                      </span>
                    )}
                    <span
                      className={cn(
                        entry.kind === "chat" && "text-foreground/90",
                      )}
                    >
                      {entry.text}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

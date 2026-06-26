import {
  infiniteQueryOptions,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  CookieIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MapPinIcon,
  MonitorSmartphoneIcon,
  RotateCcwKeyIcon,
  TicketIcon,
  WifiIcon,
  WifiOffIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  MenuItem,
  MenuSeparator,
} from "@/components/context-menu-primitives.tsx";
import { FoodBar, HeartsBar } from "@/components/minecraft/vitals.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  BotConnectionPhase,
  type BotListEntry,
} from "@/generated/soulfire/bot_pb.ts";
import { MinecraftAccountProto_AccountTypeProto } from "@/generated/soulfire/common_pb.ts";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import {
  getEnumKeyByValue,
  type InstanceInfoQueryData,
  mapUnionToValue,
} from "@/lib/types.ts";
import { cn } from "@/lib/utils.tsx";
import { MinecraftHead } from "../minecraft/minecraft-head.tsx";

const PAGE_SIZE = 50;

export type BotWithStatus =
  InstanceInfoQueryData["profile"]["accounts"][number] & {
    isOnline: boolean;
    connectionPhase: BotConnectionPhase;
    pingMs?: number;
    accountName?: string;
    liveState?: BotListEntry["liveState"];
  };

function connectionPhaseMeta(phase: BotConnectionPhase): {
  labelKey: string;
  className: string;
  dot: string;
  showPing: boolean;
} {
  switch (phase) {
    case BotConnectionPhase.CONNECTING:
      return {
        labelKey: "bots.connectionPhase.connecting",
        className: "border-amber-500/40 text-amber-600 dark:text-amber-400",
        dot: "bg-amber-500",
        showPing: false,
      };
    case BotConnectionPhase.CONNECTED:
      return {
        labelKey: "bots.connectionPhase.connected",
        className:
          "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        dot: "bg-emerald-500",
        showPing: true,
      };
    case BotConnectionPhase.SPAWNED:
      return {
        labelKey: "bots.connectionPhase.spawned",
        className:
          "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        dot: "bg-emerald-500",
        showPing: true,
      };
    case BotConnectionPhase.DIED:
      return {
        labelKey: "bots.connectionPhase.died",
        className: "border-red-500/40 text-red-600 dark:text-red-400",
        dot: "bg-red-500",
        showPing: true,
      };
    default:
      return {
        labelKey: "bots.connectionPhase.disconnected",
        className: "text-muted-foreground",
        dot: "bg-muted-foreground/50",
        showPing: false,
      };
  }
}

/// Status pill for a bot's live connection phase, with optional ping readout.
export function ConnectionPhaseBadge({
  phase,
  pingMs,
  className,
}: {
  phase: BotConnectionPhase;
  pingMs?: number;
  className?: string;
}) {
  const { t } = useTranslation("instance");
  const meta = connectionPhaseMeta(phase);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-xs", meta.className, className)}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {t(meta.labelKey)}
      {meta.showPing && pingMs !== undefined && (
        <span className="text-muted-foreground inline-flex items-center gap-0.5">
          <WifiIcon className="size-3" />
          {t("bots.connectionPhase.ping", { ms: pingMs })}
        </span>
      )}
    </Badge>
  );
}

export const accountTypeToIcon = (
  type: keyof typeof MinecraftAccountProto_AccountTypeProto,
) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "OFFLINE":
        return WifiOffIcon;
      case "MICROSOFT_JAVA_CREDENTIALS":
        return KeyRoundIcon;
      case "MICROSOFT_JAVA_DEVICE_CODE":
        return MonitorSmartphoneIcon;
      case "MICROSOFT_JAVA_REFRESH_TOKEN":
        return RotateCcwKeyIcon;
      case "MICROSOFT_JAVA_COOKIES":
        return CookieIcon;
      case "MICROSOFT_JAVA_ACCESS_TOKEN":
        return TicketIcon;
      case "THE_ALTENING":
        return TicketIcon;
      case "MICROSOFT_BEDROCK_CREDENTIALS":
        return KeyRoundIcon;
      case "MICROSOFT_BEDROCK_DEVICE_CODE":
        return MonitorSmartphoneIcon;
    }
  });

export const accountTypeLabel = (
  type: keyof typeof MinecraftAccountProto_AccountTypeProto,
) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "OFFLINE":
        return "Offline";
      case "MICROSOFT_JAVA_CREDENTIALS":
      case "MICROSOFT_JAVA_DEVICE_CODE":
      case "MICROSOFT_JAVA_REFRESH_TOKEN":
      case "MICROSOFT_JAVA_COOKIES":
      case "MICROSOFT_JAVA_ACCESS_TOKEN":
      case "THE_ALTENING":
        return "Java";
      case "MICROSOFT_BEDROCK_CREDENTIALS":
      case "MICROSOFT_BEDROCK_DEVICE_CODE":
        return "Bedrock";
    }
  });

export function BotCardSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function buildStatusMap(bots: BotListEntry[]): Map<string, BotListEntry> {
  const map = new Map<string, BotListEntry>();
  for (const entry of bots) {
    map.set(entry.profileId, entry);
  }
  return map;
}

function mergeBotStatus(
  accounts: InstanceInfoQueryData["profile"]["accounts"],
  statusMap: Map<string, BotListEntry>,
): BotWithStatus[] {
  return accounts.map((account): BotWithStatus => {
    const status = statusMap.get(account.profileId);
    return {
      ...account,
      isOnline: status?.isOnline ?? false,
      connectionPhase:
        status?.connectionPhase ?? BotConnectionPhase.DISCONNECTED,
      pingMs: status?.pingMs,
      accountName: status?.accountName,
      liveState: status?.liveState,
    };
  });
}

function BotCard({
  bot,
  instanceId,
  onContextMenu,
}: {
  bot: BotWithStatus;
  instanceId: string;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const typeKey = getEnumKeyByValue(
    MinecraftAccountProto_AccountTypeProto,
    bot.type,
  );
  const Icon = accountTypeToIcon(typeKey);
  const typeLabel = accountTypeLabel(typeKey);
  const displayName = bot.accountName || bot.lastKnownName;

  return (
    <Link
      to="/instance/$instance/bot/$botId"
      params={{ instance: instanceId, botId: bot.profileId }}
      onContextMenu={onContextMenu}
    >
      <Card className="hover:bg-muted/50 h-full cursor-pointer transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <MinecraftHead
              skinTextureHash={bot.liveState?.skinTextureHash}
              size={48}
              name={displayName}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardTitle className="truncate text-base">
                {displayName}
              </CardTitle>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  <Icon className="mr-1 size-3" />
                  {typeLabel}
                </Badge>
                <ConnectionPhaseBadge
                  phase={bot.connectionPhase}
                  pingMs={bot.pingMs}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        {bot.isOnline && bot.liveState && (
          <CardContent className="flex flex-col gap-2 pt-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <HeartsBar
                health={bot.liveState.health}
                maxHealth={bot.liveState.maxHealth}
              />
              <FoodBar foodLevel={bot.liveState.foodLevel} />
            </div>
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <MapPinIcon className="size-3" />
              <span className="select-text">
                {bot.liveState.x.toFixed(1)}, {bot.liveState.y.toFixed(1)},{" "}
                {bot.liveState.z.toFixed(1)}
              </span>
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

/// Renders a grid of bot cards with a shared right-click context menu.
function BotCardsWithMenu({
  instanceId,
  bots,
}: {
  instanceId: string;
  bots: BotWithStatus[];
}) {
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const copyToClipboard = useCopyToClipboard();
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<BotWithStatus>();

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {bots.map((bot) => (
          <BotCard
            key={bot.profileId}
            bot={bot}
            instanceId={instanceId}
            onContextMenu={(e) => handleContextMenu(e, bot)}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <MenuItem
            onClick={() => {
              void navigate({
                to: "/instance/$instance/bot/$botId",
                params: {
                  instance: instanceId,
                  botId: contextMenu.data.profileId,
                },
              });
              dismiss();
            }}
          >
            <ExternalLinkIcon />
            {tCommon("contextMenu.bot.goToBot")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.lastKnownName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUsername")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUuid")}
          </MenuItem>
          {contextMenu.data.isOnline && contextMenu.data.liveState && (
            <MenuItem
              onClick={() => {
                const { x, y, z } = contextMenu.data.liveState ?? {
                  x: 0,
                  y: 0,
                  z: 0,
                };
                copyToClipboard(
                  `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`,
                );
                dismiss();
              }}
            >
              <ClipboardCopyIcon />
              {tCommon("contextMenu.bot.copyCoordinates")}
            </MenuItem>
          )}
        </ContextMenuPortal>
      )}
    </>
  );
}

/// Badge showing how many configured accounts are currently online.
export function OnlineCountBadge({
  instanceInfo,
}: {
  instanceInfo: InstanceInfoQueryData;
}) {
  const { t } = useTranslation("instance");
  const { data: botStatus } = useSuspenseQuery(
    botStatusQueryOptions(instanceInfo.id),
  );

  const onlineCount = useMemo(() => {
    const statusMap = buildStatusMap(botStatus.bots);
    return instanceInfo.profile.accounts.filter(
      (account) => statusMap.get(account.profileId)?.isOnline ?? false,
    ).length;
  }, [instanceInfo.profile.accounts, botStatus.bots]);

  return (
    <Badge variant="outline" className="w-fit">
      {t("bots.onlineCount", {
        online: onlineCount,
        total: instanceInfo.profile.accounts.length,
      })}
    </Badge>
  );
}

/// Full bot grid with search filtering and client side infinite scrolling.
export function BotGrid({
  instanceInfo,
  search,
}: {
  instanceInfo: InstanceInfoQueryData;
  search: string;
}) {
  const { t } = useTranslation("instance");
  const { data: botStatus } = useSuspenseQuery(
    botStatusQueryOptions(instanceInfo.id),
  );

  const statusMap = useMemo(
    () => buildStatusMap(botStatus.bots),
    [botStatus.bots],
  );

  const filteredAccounts = useMemo(() => {
    const accounts = instanceInfo.profile.accounts;
    if (!search.trim()) return accounts;
    const searchLower = search.toLowerCase();
    return accounts.filter((account) =>
      account.lastKnownName.toLowerCase().includes(searchLower),
    );
  }, [instanceInfo.profile.accounts, search]);

  const botsInfiniteQueryOptions = useMemo(
    () =>
      infiniteQueryOptions({
        queryKey: [
          "bots-paginated",
          instanceInfo.id,
          filteredAccounts.map((a) => a.profileId).join(","),
        ],
        queryFn: ({ pageParam }) => {
          const start = pageParam * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          const pageAccounts = filteredAccounts.slice(start, end);
          return {
            accounts: pageAccounts,
            nextPage: end < filteredAccounts.length ? pageParam + 1 : undefined,
            totalCount: filteredAccounts.length,
          };
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextPage,
      }),
    [instanceInfo.id, filteredAccounts],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(botsInfiniteQueryOptions);

  const botsWithStatus = useMemo(
    () =>
      mergeBotStatus(
        data.pages.flatMap((page) => page.accounts),
        statusMap,
      ),
    [data.pages, statusMap],
  );

  const totalCount = filteredAccounts.length;
  const loadedCount = botsWithStatus.length;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "100px",
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleIntersection]);

  if (filteredAccounts.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center">
        {instanceInfo.profile.accounts.length === 0
          ? t("bots.noBots")
          : t("bots.noBotsFound")}
      </div>
    );
  }

  return (
    <>
      <BotCardsWithMenu instanceId={instanceInfo.id} bots={botsWithStatus} />
      <div ref={loadMoreRef} className="flex justify-center py-4">
        {isFetchingNextPage ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <LoaderCircleIcon className="size-4 animate-spin" />
            <span>{t("bots.loadingMore")}</span>
          </div>
        ) : hasNextPage ? (
          <span className="text-muted-foreground text-sm">
            {t("bots.showingCount", { loaded: loadedCount, total: totalCount })}
          </span>
        ) : loadedCount > PAGE_SIZE ? (
          <span className="text-muted-foreground text-sm">
            {t("bots.allLoaded", { total: totalCount })}
          </span>
        ) : null}
      </div>
    </>
  );
}

/// Compact bot grid for the overview: online bots first, capped to a limit,
/// with a link to the full bots page.
export function BotGridPreview({
  instanceInfo,
  limit = 8,
}: {
  instanceInfo: InstanceInfoQueryData;
  limit?: number;
}) {
  const { t } = useTranslation("instance");
  const { data: botStatus } = useSuspenseQuery(
    botStatusQueryOptions(instanceInfo.id),
  );

  const statusMap = useMemo(
    () => buildStatusMap(botStatus.bots),
    [botStatus.bots],
  );

  const previewBots = useMemo(() => {
    const merged = mergeBotStatus(instanceInfo.profile.accounts, statusMap);
    return [...merged]
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline))
      .slice(0, limit);
  }, [instanceInfo.profile.accounts, statusMap, limit]);

  const totalCount = instanceInfo.profile.accounts.length;

  if (totalCount === 0) {
    return (
      <div className="text-muted-foreground py-6 text-center text-sm">
        {t("bots.noBots")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BotCardsWithMenu instanceId={instanceInfo.id} bots={previewBots} />
      {totalCount > previewBots.length && (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/bots"
              params={{ instance: instanceInfo.id }}
            />
          }
        >
          {t("overview.bots.viewAll", { total: totalCount })}
        </Button>
      )}
    </div>
  );
}

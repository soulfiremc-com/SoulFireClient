import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  WifiIcon,
} from "lucide-react";
import {
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import { FoodBar, HeartsBar } from "@/components/minecraft/vitals.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  BotConnectionPhase,
  BotDesiredState,
  type BotListEntry,
  BotService,
} from "@/generated/soulfire/bot_pb";
import {
  InstancePermission,
  MinecraftAccountProto_AccountTypeProto,
} from "@/generated/soulfire/common_pb";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import {
  accountTypeToIcon,
  translateAccountType,
} from "@/lib/account-types.ts";
import { type BotDisplayState, getBotDisplayState } from "@/lib/bot-fleet.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import { getEnumKeyByValue, type InstanceInfoQueryData } from "@/lib/types.ts";
import { cn, hasInstancePermission } from "@/lib/utils.tsx";
import { BOT_STATE_META } from "./fleet-status.tsx";
import { MinecraftHead } from "../minecraft/minecraft-head.tsx";

const PAGE_SIZE = 50;

export type BotWithStatus =
  InstanceInfoQueryData["profile"]["accounts"][number] & {
    isOnline: boolean;
    connectionPhase: BotConnectionPhase;
    pingMs?: number;
    accountName?: string;
    liveState?: BotListEntry["liveState"];
    status?: BotListEntry["status"];
  };

type StatusTone = "warning" | "success" | "destructive" | "muted";

export function connectionPhaseMeta(phase: BotConnectionPhase): {
  labelKey: string;
  tone: StatusTone;
  dot: string;
  showPing: boolean;
} {
  switch (phase) {
    case BotConnectionPhase.CONNECTING:
      return {
        labelKey: "bots.connectionPhase.connecting",
        tone: "warning",
        dot: "bg-warning",
        showPing: false,
      };
    case BotConnectionPhase.CONNECTED:
      return {
        labelKey: "bots.connectionPhase.connected",
        tone: "success",
        dot: "bg-success",
        showPing: true,
      };
    case BotConnectionPhase.SPAWNED:
      return {
        labelKey: "bots.connectionPhase.spawned",
        tone: "success",
        dot: "bg-success",
        showPing: true,
      };
    case BotConnectionPhase.DIED:
      return {
        labelKey: "bots.connectionPhase.died",
        tone: "destructive",
        dot: "bg-destructive",
        showPing: true,
      };
    default:
      return {
        labelKey: "bots.connectionPhase.disconnected",
        tone: "muted",
        dot: "bg-muted-foreground/50",
        showPing: false,
      };
  }
}

/// One status per bot, so "should run" never reads as "connected".
export function BotStateBadge({
  bot,
  className,
}: {
  bot: {
    isOnline: boolean;
    connectionPhase: BotConnectionPhase;
    pingMs?: number;
    status?: BotListEntry["status"];
  };
  className?: string;
}) {
  const { t } = useTranslation("instance");
  const state = getBotDisplayState(bot);
  const meta = BOT_STATE_META[state];
  return (
    <Badge
      variant="outline"
      className={className}
      title={bot.status?.lastError}
    >
      <meta.icon
        aria-hidden="true"
        className={cn(
          "size-3",
          meta.text,
          meta.spin && "motion-safe:animate-spin",
        )}
      />
      <span className={meta.text}>{t(`bots.displayState.${state}`)}</span>
      {state === "connected" && bot.pingMs !== undefined && (
        <span className="text-muted-foreground inline-flex items-center gap-0.5">
          <WifiIcon aria-hidden="true" className="size-3" />
          {t("bots.connectionPhase.ping", { ms: bot.pingMs })}
        </span>
      )}
    </Badge>
  );
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
      className={cn(
        "gap-1 text-xs",
        meta.tone === "warning" && "border-warning/40 text-warning-emphasis",
        meta.tone === "success" && "border-success/40 text-success-emphasis",
        meta.tone === "destructive" && "border-destructive/40 text-destructive",
        meta.tone === "muted" && "text-muted-foreground",
        className,
      )}
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
      status: status?.status,
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
  const { i18n } = useTranslation("instance");
  const typeLabel = translateAccountType(i18n, typeKey);
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
                <BotStateBadge bot={bot} />
              </div>
            </div>
          </div>
        </CardHeader>
        {!bot.isOnline && bot.status?.lastError && (
          <CardContent className="pt-0">
            <p
              className="text-muted-foreground line-clamp-2 text-xs break-words"
              title={bot.status.lastError}
            >
              {bot.status.lastError}
            </p>
          </CardContent>
        )}
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

/// Shares bot actions between the card grid and compact overview list.
export function BotContextMenu({
  instanceId,
  children,
  canControl,
}: {
  instanceId: string;
  children: (
    onContextMenu: (event: React.MouseEvent, bot: BotWithStatus) => void,
  ) => ReactNode;
  canControl: boolean;
}) {
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const transport = use(TransportContext);
  const queryClient = useQueryClient();
  const copyToClipboard = useCopyToClipboard();
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<BotWithStatus>();
  const botStateMutation = useMutation({
    mutationKey: ["bots", "desired-state", instanceId],
    scope: { id: `bot-state-${instanceId}` },
    mutationFn: async ({
      botId,
      action,
    }: {
      botId: string;
      action: "start" | "restart" | "stop";
    }) => {
      if (transport === null) return;
      const client = createRpcClient(BotService, transport);
      if (action === "restart") {
        return Effect.runPromise(
          client.restartBots({ instanceId, botIds: [botId] }),
        );
      }
      return Effect.runPromise(
        client.setBotsDesiredState({
          instanceId,
          botIds: [botId],
          desiredState:
            action === "start"
              ? BotDesiredState.RUNNING
              : BotDesiredState.STOPPED,
        }),
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bot-status", instanceId] }),
        queryClient.invalidateQueries({
          queryKey: ["instance-info", instanceId],
        }),
        queryClient.invalidateQueries({ queryKey: ["instance-list"] }),
      ]);
    },
  });

  return (
    <>
      {children(handleContextMenu)}
      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <DropdownMenuItem
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
          </DropdownMenuItem>
          {canControl && (
            <>
              <DropdownMenuSeparator />
              {contextMenu.data.status?.desiredState ===
              BotDesiredState.RUNNING ? (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      botStateMutation.mutate({
                        botId: contextMenu.data.profileId,
                        action: "restart",
                      });
                      dismiss();
                    }}
                  >
                    <RefreshCwIcon />
                    {tCommon("controls.restart")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      botStateMutation.mutate({
                        botId: contextMenu.data.profileId,
                        action: "stop",
                      });
                      dismiss();
                    }}
                  >
                    <SquareIcon />
                    {tCommon("controls.stop")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  onClick={() => {
                    botStateMutation.mutate({
                      botId: contextMenu.data.profileId,
                      action: "start",
                    });
                    dismiss();
                  }}
                >
                  <PlayIcon />
                  {tCommon("controls.start")}
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              copyToClipboard(
                contextMenu.data.accountName || contextMenu.data.lastKnownName,
              );
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUsername")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUuid")}
          </DropdownMenuItem>
          {contextMenu.data.isOnline && contextMenu.data.liveState && (
            <DropdownMenuItem
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
            </DropdownMenuItem>
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
  status,
}: {
  instanceInfo: InstanceInfoQueryData;
  search: string;
  status?: BotDisplayState | null;
}) {
  const { t } = useTranslation("instance");
  const { data: botStatus } = useSuspenseQuery(
    botStatusQueryOptions(instanceInfo.id),
  );
  const canControl = hasInstancePermission(
    instanceInfo,
    InstancePermission.CONTROL_BOTS,
  );

  const statusMap = useMemo(
    () => buildStatusMap(botStatus.bots),
    [botStatus.bots],
  );

  const filteredAccounts = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return instanceInfo.profile.accounts.filter(
      (account) =>
        account.lastKnownName.toLowerCase().includes(searchLower) &&
        (!status ||
          getBotDisplayState(statusMap.get(account.profileId)) === status),
    );
  }, [instanceInfo.profile.accounts, search, status, statusMap]);

  const botsInfiniteQueryOptions = useMemo(
    () =>
      infiniteQueryOptions({
        queryKey: [
          "bot-account-pages",
          instanceInfo.id,
          filteredAccounts.map((a) => a.profileId).join(","),
        ],
        queryFn: ({ pageParam }) => {
          const start = pageParam * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          return {
            profileIds: filteredAccounts
              .slice(start, end)
              .map((account) => account.profileId),
            nextPage: end < filteredAccounts.length ? pageParam + 1 : undefined,
          };
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextPage,
      }),
    [instanceInfo.id, filteredAccounts],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(botsInfiniteQueryOptions);

  const visibleAccounts = useMemo(() => {
    const visibleIds = new Set(data.pages.flatMap((page) => page.profileIds));
    return filteredAccounts.filter((account) =>
      visibleIds.has(account.profileId),
    );
  }, [data.pages, filteredAccounts]);

  const botsWithStatus = useMemo(
    () => mergeBotStatus(visibleAccounts, statusMap),
    [visibleAccounts, statusMap],
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
          : status && !search.trim()
            ? t("bots.noBotsInState")
            : t("bots.noBotsFound")}
      </div>
    );
  }

  return (
    <>
      <BotContextMenu instanceId={instanceInfo.id} canControl={canControl}>
        {(onContextMenu) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {botsWithStatus.map((bot) => (
              <BotCard
                key={bot.profileId}
                bot={bot}
                instanceId={instanceInfo.id}
                onContextMenu={(event) => onContextMenu(event, bot)}
              />
            ))}
          </div>
        )}
      </BotContextMenu>
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

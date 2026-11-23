import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchXIcon,
  SquareIcon,
  UsersIcon,
  WifiIcon,
} from "lucide-react";
import {
  memo,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  type BotConnectionPhase,
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
import { accountTypeIcons, translateAccountType } from "@/lib/account-types.ts";
import { type BotDisplayState, getBotDisplayState } from "@/lib/bot-fleet.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import {
  botDisplayName,
  type BotWithStatus,
  withBotStatus,
} from "@/lib/bot-with-status.ts";
import { formatFixed } from "@/lib/format.ts";
import { getEnumKeyByValue, type InstanceInfoQueryData } from "@/lib/types.ts";
import { cn, hasInstancePermission } from "@/lib/utils.tsx";

import { BOT_STATE_META } from "./fleet-status-meta.ts";
import { MinecraftHead } from "../minecraft/minecraft-head.tsx";

const PAGE_SIZE = 50;

/// One status per bot, so "should run" never reads as "connected".
export function BotStateBadge({
  bot,
  className,
}: {
  bot: {
    isOnline: boolean;
    connectionPhase: BotConnectionPhase;
    pingMs?: number | undefined;
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
        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
          <WifiIcon aria-hidden="true" className="size-3" />
          {t("bots.connectionPhase.ping", { ms: bot.pingMs })}
        </span>
      )}
    </Badge>
  );
}

export function BotCardSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-sm" />
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

type BotActionsRenderer = (bot: BotWithStatus, close: () => void) => ReactNode;

function closeOnSelect() {
  // Menu items close the dropdown on click by themselves.
}

/// Builds the action items only while the dropdown is open.
function BotCardActions({
  bot,
  renderActions,
}: {
  bot: BotWithStatus;
  renderActions: BotActionsRenderer;
}) {
  return renderActions(bot, closeOnSelect);
}

/// Memoized, so a status poll only re-renders the cards whose entry changed.
/// The status query keeps unchanged entries by reference.
const BotCard = memo(function BotCard({
  account,
  entry,
  instanceId,
  onContextMenu,
  renderActions,
}: {
  account: InstanceInfoQueryData["profile"]["accounts"][number];
  entry: BotListEntry | undefined;
  instanceId: string;
  onContextMenu: (event: React.MouseEvent, bot: BotWithStatus) => void;
  renderActions: BotActionsRenderer;
}) {
  const bot = useMemo(() => withBotStatus(account, entry), [account, entry]);
  const typeKey = getEnumKeyByValue(
    MinecraftAccountProto_AccountTypeProto,
    bot.type,
  );
  const Icon = accountTypeIcons[typeKey];
  const { i18n, t } = useTranslation("common");
  const typeLabel = translateAccountType(i18n, typeKey);
  const displayName = botDisplayName(account, entry);

  return (
    <li className="relative">
      <Link
        to="/instance/$instance/bot/$botId"
        params={{ instance: instanceId, botId: bot.profileId }}
        onContextMenu={(event) => {
          onContextMenu(event, bot);
        }}
      >
        <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
          <CardHeader className="pr-12 pb-2">
            <div className="flex items-start gap-3">
              <MinecraftHead
                skinTextureHash={bot.liveState?.skinTextureHash}
                size={48}
                name={displayName}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <CardTitle className="truncate text-base" title={displayName}>
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
                className="line-clamp-2 text-xs wrap-break-word text-muted-foreground"
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
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPinIcon className="size-3" />
                <span className="select-text">
                  {t("instance:bots.positionPanel.coordinates", {
                    x: formatFixed(bot.liveState.x, 1),
                    y: formatFixed(bot.liveState.y, 1),
                    z: formatFixed(bot.liveState.z, 1),
                  })}
                </span>
              </div>
            </CardContent>
          )}
        </Card>
      </Link>
      {/* Touch screens cannot open the right-click menu, so the same actions live here. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3"
              aria-label={t("contextMenu.bot.actions", { name: displayName })}
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <BotCardActions bot={bot} renderActions={renderActions} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
});

/// Shares bot actions between the card grid and compact overview list.
export function BotContextMenu({
  instanceId,
  children,
  canControl,
}: {
  instanceId: string;
  children: (
    onContextMenu: (event: React.MouseEvent, bot: BotWithStatus) => void,
    renderActions: BotActionsRenderer,
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
      if (transport === null) return undefined;
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
    onError: (error, { action }) => {
      console.error(error);
      toast.error(tCommon(`controls.${action}Toast.error`), {
        description: error.message,
      });
    },
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

  const { mutate: mutateBotState } = botStateMutation;
  const renderActions = useCallback<BotActionsRenderer>(
    (bot, close) => (
      <>
        <DropdownMenuItem
          onClick={() => {
            void navigate({
              to: "/instance/$instance/bot/$botId",
              params: {
                instance: instanceId,
                botId: bot.profileId,
              },
            });
            close();
          }}
        >
          <ExternalLinkIcon />
          {tCommon("contextMenu.bot.goToBot")}
        </DropdownMenuItem>
        {canControl && (
          <>
            <DropdownMenuSeparator />
            {bot.status?.desiredState === BotDesiredState.RUNNING ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    mutateBotState({
                      botId: bot.profileId,
                      action: "restart",
                    });
                    close();
                  }}
                >
                  <RefreshCwIcon />
                  {tCommon("controls.restart")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    mutateBotState({
                      botId: bot.profileId,
                      action: "stop",
                    });
                    close();
                  }}
                >
                  <SquareIcon />
                  {tCommon("controls.stop")}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  mutateBotState({
                    botId: bot.profileId,
                    action: "start",
                  });
                  close();
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
            void copyToClipboard(botDisplayName(bot, bot));
            close();
          }}
        >
          <ClipboardCopyIcon />
          {tCommon("contextMenu.bot.copyUsername")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void copyToClipboard(bot.profileId);
            close();
          }}
        >
          <ClipboardCopyIcon />
          {tCommon("contextMenu.bot.copyUuid")}
        </DropdownMenuItem>
        {bot.isOnline && bot.liveState && (
          <DropdownMenuItem
            onClick={() => {
              const { x, y, z } = bot.liveState ?? {
                x: 0,
                y: 0,
                z: 0,
              };
              void copyToClipboard(
                `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`,
              );
              close();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyCoordinates")}
          </DropdownMenuItem>
        )}
      </>
    ),
    [
      canControl,
      copyToClipboard,
      instanceId,
      mutateBotState,
      navigate,
      tCommon,
    ],
  );

  return (
    <>
      {children(handleContextMenu, renderActions)}
      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          {renderActions(contextMenu.data, dismiss)}
        </ContextMenuPortal>
      )}
    </>
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
        botDisplayName(account, statusMap.get(account.profileId))
          .toLowerCase()
          .includes(searchLower) &&
        (!status ||
          getBotDisplayState(statusMap.get(account.profileId)) === status),
    );
  }, [instanceInfo.profile.accounts, search, status, statusMap]);

  // Show one more page each time the end of the grid scrolls into view. A new
  // search or filter starts again at the first page, but status polls do not.
  const pagingKey = `${instanceInfo.id}\u0000${search}\u0000${status ?? ""}`;
  const [paging, setPaging] = useState({ key: pagingKey, count: PAGE_SIZE });
  if (paging.key !== pagingKey) {
    setPaging({ key: pagingKey, count: PAGE_SIZE });
  }
  const visibleCount = paging.key === pagingKey ? paging.count : PAGE_SIZE;
  const hasNextPage = visibleCount < filteredAccounts.length;

  const visibleAccounts = useMemo(
    () => filteredAccounts.slice(0, visibleCount),
    [filteredAccounts, visibleCount],
  );

  const totalCount = filteredAccounts.length;
  const loadedCount = visibleAccounts.length;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry?.isIntersecting && hasNextPage) {
        // Setting a count instead of adding to it keeps repeated reports
        // from one observer from skipping pages.
        setPaging({ key: pagingKey, count: visibleCount + PAGE_SIZE });
      }
    },
    [hasNextPage, pagingKey, visibleCount],
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "100px",
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
    // handleIntersection changes after each page. The new observer reports
    // the sentinel at once, so a sentinel that stays in view on a tall
    // screen still loads the next page.
  }, [handleIntersection]);

  if (filteredAccounts.length === 0) {
    const noAccounts = instanceInfo.profile.accounts.length === 0;
    return (
      <Empty className="flex-1 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {noAccounts ? <UsersIcon /> : <SearchXIcon />}
          </EmptyMedia>
          <EmptyTitle>
            {noAccounts
              ? t("bots.noBots")
              : status && !search.trim()
                ? t("bots.noBotsInState")
                : t("bots.noBotsFound")}
          </EmptyTitle>
        </EmptyHeader>
        {noAccounts && (
          <EmptyContent>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to="/instance/$instance/accounts"
                  params={{ instance: instanceInfo.id }}
                />
              }
            >
              <PlusIcon data-icon="inline-start" />
              {t("account.addAccounts")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <>
      <BotContextMenu instanceId={instanceInfo.id} canControl={canControl}>
        {(onContextMenu, renderActions) => (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleAccounts.map((account) => (
              <BotCard
                key={account.profileId}
                account={account}
                entry={statusMap.get(account.profileId)}
                instanceId={instanceInfo.id}
                onContextMenu={onContextMenu}
                renderActions={renderActions}
              />
            ))}
          </ul>
        )}
      </BotContextMenu>
      <div ref={loadMoreRef} className="flex justify-center py-4">
        {hasNextPage ? (
          <span className="text-sm text-muted-foreground">
            {t("bots.showingCount", { loaded: loadedCount, total: totalCount })}
          </span>
        ) : loadedCount > PAGE_SIZE ? (
          <span className="text-sm text-muted-foreground">
            {t("bots.allLoaded", { total: totalCount })}
          </span>
        ) : null}
      </div>
    </>
  );
}

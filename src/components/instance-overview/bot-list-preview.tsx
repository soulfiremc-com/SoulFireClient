import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  DrumstickIcon,
  HeartIcon,
  WifiIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BotContextMenu,
  connectionPhaseMeta,
} from "@/components/instance-overview/bot-grid.tsx";
import { MinecraftHead } from "@/components/minecraft/minecraft-head.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { BotConnectionPhase } from "@/generated/soulfire/bot_pb";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";
import { cn, hasInstancePermission } from "@/lib/utils.tsx";

export function BotListPreview({
  instanceInfo,
}: {
  instanceInfo: InstanceInfoQueryData;
}) {
  const { t } = useTranslation("instance");
  const { data, isPending, isError } = useQuery(
    botStatusQueryOptions(instanceInfo.id),
  );
  const statusMap = new Map(data?.bots.map((bot) => [bot.profileId, bot]));
  const accounts = instanceInfo.profile.accounts;
  const preview = [...accounts]
    .sort(
      (a, b) =>
        Number(statusMap.get(b.profileId)?.isOnline ?? false) -
        Number(statusMap.get(a.profileId)?.isOnline ?? false),
    )
    .slice(0, 4);

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-labelledby="overview-bots-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="overview-bots-title" className="text-sm font-medium">
          {t("overview.bots.title")}{" "}
          <span className="text-muted-foreground ml-1 tabular-nums">
            {accounts.length}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/bots"
              params={{ instance: instanceInfo.id }}
            />
          }
        >
          {t("overview.bots.viewAllShort")}
        </Button>
      </div>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("bots.noBots")}</p>
      ) : (
        <BotContextMenu
          instanceId={instanceInfo.id}
          canControl={hasInstancePermission(
            instanceInfo,
            InstancePermission.CONTROL_BOTS,
          )}
        >
          {(onContextMenu) => (
            <ItemGroup>
              {preview.map((account) => {
                const bot = statusMap.get(account.profileId);
                const name = bot?.accountName || account.lastKnownName;
                const phase = connectionPhaseMeta(
                  bot?.connectionPhase ?? BotConnectionPhase.DISCONNECTED,
                );
                const live = bot?.isOnline ? bot.liveState : undefined;
                return (
                  <div key={account.profileId} role="listitem">
                    <Item
                      size="xs"
                      render={
                        <Link
                          to="/instance/$instance/bot/$botId"
                          params={{
                            instance: instanceInfo.id,
                            botId: account.profileId,
                          }}
                        />
                      }
                      aria-label={t("overview.bots.detailsFor", { name })}
                      onContextMenu={(event) =>
                        onContextMenu(event, {
                          ...account,
                          isOnline: bot?.isOnline ?? false,
                          connectionPhase:
                            bot?.connectionPhase ??
                            BotConnectionPhase.DISCONNECTED,
                          pingMs: bot?.pingMs,
                          accountName: bot?.accountName,
                          liveState: bot?.liveState,
                          status: bot?.status,
                        })
                      }
                    >
                      <ItemMedia>
                        <MinecraftHead
                          skinTextureHash={bot?.liveState?.skinTextureHash}
                          name={name}
                          size={32}
                        />
                      </ItemMedia>
                      <ItemContent className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <ItemTitle title={name}>{name}</ItemTitle>
                          {isPending ? (
                            <Skeleton className="h-3 w-10" />
                          ) : isError && !data ? (
                            <span className="text-muted-foreground text-xs">
                              {t("overview.loadError")}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-1 text-xs",
                                phase.tone === "success" &&
                                  "text-success-emphasis",
                                phase.tone === "warning" &&
                                  "text-warning-emphasis",
                                phase.tone === "destructive" &&
                                  "text-destructive",
                                phase.tone === "muted" &&
                                  "text-muted-foreground",
                              )}
                            >
                              <span
                                className={cn("size-1 rounded-full", phase.dot)}
                              />
                              {t(phase.labelKey)}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
                          <span
                            className="flex items-center gap-1"
                            title={t("bots.statsPanel.health")}
                          >
                            <HeartIcon
                              aria-hidden="true"
                              className="text-destructive size-3"
                            />
                            <span className="sr-only">
                              {t("bots.statsPanel.health")}:{" "}
                            </span>
                            {isPending ? (
                              <Skeleton className="h-3 w-8" />
                            ) : live ? (
                              `${Math.round(live.health)}/${Math.round(live.maxHealth || 20)}`
                            ) : (
                              "-"
                            )}
                          </span>
                          <span
                            className="flex items-center gap-1"
                            title={t("bots.statsPanel.food")}
                          >
                            <DrumstickIcon
                              aria-hidden="true"
                              className="text-warning-emphasis size-3"
                            />
                            <span className="sr-only">
                              {t("bots.statsPanel.food")}:{" "}
                            </span>
                            {isPending ? (
                              <Skeleton className="h-3 w-8" />
                            ) : live ? (
                              `${live.foodLevel}/20`
                            ) : (
                              "-"
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <WifiIcon aria-hidden="true" className="size-3" />
                            {isPending ? (
                              <Skeleton className="h-3 w-8" />
                            ) : phase.showPing && bot?.pingMs !== undefined ? (
                              t("bots.connectionPhase.ping", { ms: bot.pingMs })
                            ) : (
                              "-"
                            )}
                          </span>
                        </div>
                      </ItemContent>
                      <ItemActions>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="text-muted-foreground size-3.5"
                        />
                      </ItemActions>
                    </Item>
                  </div>
                );
              })}
            </ItemGroup>
          )}
        </BotContextMenu>
      )}
    </section>
  );
}

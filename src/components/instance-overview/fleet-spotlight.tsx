import { createClient } from "@connectrpc/connect";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BoxesIcon, GlobeIcon, MapPinIcon, StarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  accountTypeLabel,
  accountTypeToIcon,
  ConnectionPhaseBadge,
} from "@/components/instance-overview/bot-grid.tsx";
import { MinecraftHead } from "@/components/minecraft/minecraft-head.tsx";
import { FoodBar, HeartsBar } from "@/components/minecraft/vitals.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { AutomationService } from "@/generated/soulfire/automation_pb.ts";
import {
  BotConnectionPhase,
  type BotListEntry,
  GameMode,
} from "@/generated/soulfire/bot_pb.ts";
import { MinecraftAccountProto_AccountTypeProto } from "@/generated/soulfire/common_pb.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import {
  getEnumKeyByValue,
  type InstanceInfoQueryData,
  type ProfileAccount,
} from "@/lib/types.ts";
import { cn } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

type SpotlightBot = {
  account: ProfileAccount;
  isOnline: boolean;
  connectionPhase: BotConnectionPhase;
  pingMs?: number;
  liveState?: BotListEntry["liveState"];
};

function gameModeLabel(t: (key: string) => string, gameMode: GameMode): string {
  switch (gameMode) {
    case GameMode.SURVIVAL:
      return t("bots.statsPanel.survival");
    case GameMode.CREATIVE:
      return t("bots.statsPanel.creative");
    case GameMode.ADVENTURE:
      return t("bots.statsPanel.adventure");
    case GameMode.SPECTATOR:
      return t("bots.statsPanel.spectator");
    default:
      return t("bots.statsPanel.unknown");
  }
}

/// Featured bot hero: a switchable spotlight of one bot's live state plus a
/// strip of all bots in the instance.
export function FleetSpotlight({
  instanceInfo,
}: {
  instanceInfo: InstanceInfoQueryData;
}) {
  const { t } = useTranslation("instance");
  const { data: botStatus } = useSuspenseQuery(
    botStatusQueryOptions(instanceInfo.id),
  );
  const { data: teamState } = useQuery({
    queryKey: ["automation-team-state", instanceInfo.id],
    queryFn: async ({ signal }) => {
      const transport = createTransport();
      if (transport === null) return null;
      const service = createClient(AutomationService, transport);
      const result = await service.getAutomationTeamState(
        { instanceId: instanceInfo.id },
        { signal },
      );
      return result.state ?? null;
    },
    refetchInterval: 5_000,
    retry: false,
  });

  const bots = useMemo<SpotlightBot[]>(() => {
    const statusMap = new Map<string, BotListEntry>();
    for (const entry of botStatus.bots) {
      statusMap.set(entry.profileId, entry);
    }
    return instanceInfo.profile.accounts.map((account) => {
      const status = statusMap.get(account.profileId);
      return {
        account,
        isOnline: status?.isOnline ?? false,
        connectionPhase:
          status?.connectionPhase ?? BotConnectionPhase.DISCONNECTED,
        pingMs: status?.pingMs,
        liveState: status?.liveState,
      };
    });
  }, [instanceInfo.profile.accounts, botStatus.bots]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    bots.find((bot) => bot.account.profileId === selectedId) ??
    bots.find((bot) => bot.isOnline) ??
    bots[0];

  if (!selected) {
    return (
      <Card size="sm" className="min-h-44">
        <CardContent className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {t("overview.spotlight.noBots")}
        </CardContent>
      </Card>
    );
  }

  const { account, isOnline, connectionPhase, pingMs, liveState } = selected;
  const typeKey = getEnumKeyByValue(
    MinecraftAccountProto_AccountTypeProto,
    account.type,
  );
  const TypeIcon = accountTypeToIcon(typeKey);
  const automationBot = teamState?.bots.find(
    (bot) => bot.botId === account.profileId,
  );
  const statusLine =
    automationBot?.currentAction ??
    (automationBot?.statusSummary ? automationBot.statusSummary : undefined) ??
    t("overview.spotlight.idle");

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <MinecraftHead
            skinTextureHash={liveState?.skinTextureHash}
            size={64}
            name={account.lastKnownName}
            className="rounded-lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">
                {account.lastKnownName}
              </h3>
              <Badge variant="outline" className="text-xs">
                <TypeIcon className="mr-1 size-3" />
                {accountTypeLabel(typeKey)}
              </Badge>
              <ConnectionPhaseBadge phase={connectionPhase} pingMs={pingMs} />
            </div>
            {isOnline && liveState ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <HeartsBar
                  health={liveState.health}
                  maxHealth={liveState.maxHealth}
                  size={16}
                />
                <FoodBar foodLevel={liveState.foodLevel} size={16} />
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">
                {account.profileId}
              </span>
            )}
          </div>
        </div>

        {isOnline && liveState && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono">
              <MapPinIcon className="mr-1 size-3" />
              {liveState.x.toFixed(0)} {liveState.y.toFixed(0)}{" "}
              {liveState.z.toFixed(0)}
            </Badge>
            <Badge variant="outline">
              <GlobeIcon className="mr-1 size-3" />
              {liveState.dimension.replace("minecraft:", "")}
            </Badge>
            <Badge variant="outline">
              <BoxesIcon className="mr-1 size-3" />
              {gameModeLabel(t, liveState.gameMode)}
            </Badge>
            <Badge variant="outline">
              <StarIcon className="mr-1 size-3" />
              {t("overview.spotlight.level", {
                level: liveState.experienceLevel,
              })}
            </Badge>
          </div>
        )}

        <div className="bg-muted/40 text-muted-foreground rounded-md px-3 py-2 text-sm">
          {statusLine}
        </div>

        {bots.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {bots.map((bot) => (
              <button
                type="button"
                key={bot.account.profileId}
                onClick={() => setSelectedId(bot.account.profileId)}
                title={bot.account.lastKnownName}
                className={cn(
                  "relative shrink-0 rounded-md p-0.5 ring-2 transition-colors",
                  bot.account.profileId === selected.account.profileId
                    ? "ring-primary"
                    : "ring-transparent hover:ring-border",
                )}
              >
                <MinecraftHead
                  skinTextureHash={bot.liveState?.skinTextureHash}
                  size={32}
                  name={bot.account.lastKnownName}
                />
                {bot.isOnline && (
                  <span className="border-card absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 bg-emerald-500" />
                )}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

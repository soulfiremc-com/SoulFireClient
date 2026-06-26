import { createClient } from "@connectrpc/connect";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BlocksIcon, PauseIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  AutomationGoalMode,
  AutomationService,
} from "@/generated/soulfire/automation_pb.ts";
import type { PluginRuntimeStat } from "@/generated/soulfire/plugin_stats_pb.ts";
import { formatCompactNumber } from "@/lib/format.ts";
import { pluginStatsQueryOptions } from "@/lib/plugin-stats-query.ts";
import { timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

const MAX_AUTOMATION_BOTS = 4;

function goalModeLabel(t: (key: string) => string, mode: AutomationGoalMode) {
  switch (mode) {
    case AutomationGoalMode.ACQUIRE:
      return t("overview.automation.goalMode.acquire");
    case AutomationGoalMode.BEAT:
      return t("overview.automation.goalMode.beat");
    default:
      return t("overview.automation.goalMode.idle");
  }
}

/// Compact automation status summary for the overview right column.
export function AutomationSummary({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation("instance");
  const { data } = useQuery({
    queryKey: ["automation-team-state", instanceId],
    queryFn: async ({ signal }) => {
      const transport = createTransport();
      if (transport === null) return null;
      const service = createClient(AutomationService, transport);
      const result = await service.getAutomationTeamState(
        { instanceId },
        { signal },
      );
      return result.state ?? null;
    },
    refetchInterval: 5_000,
    retry: false,
  });

  const bots = data?.bots ?? [];

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">
          {t("overview.automation.title")}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/automation"
              params={{ instance: instanceId }}
            />
          }
        >
          {t("overview.automation.viewAll")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {bots.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("overview.automation.empty")}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              {t("overview.automation.activeBots", { count: data?.activeBots })}
            </p>
            {bots.slice(0, MAX_AUTOMATION_BOTS).map((bot) => (
              <div
                key={bot.botId}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {bot.accountName}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {bot.statusSummary}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {bot.paused && (
                    <PauseIcon className="text-muted-foreground size-3.5" />
                  )}
                  <Badge variant="outline" className="text-xs">
                    {goalModeLabel(t, bot.goalMode)}
                  </Badge>
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/// Humanizes a running-since timestamp into a short uptime string (e.g. 6h 12m).
function formatUptime(from: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function PluginStatRow({
  t,
  stat,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  stat: PluginRuntimeStat;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{stat.pluginId}</span>
          <span className="text-muted-foreground truncate text-xs">
            {t("overview.plugins.activeBots", { count: stat.activeBotCount })}
            {stat.runningSince &&
              ` · ${t("overview.plugins.uptime", {
                time: formatUptime(timestampToDate(stat.runningSince)),
              })}`}
          </span>
        </div>
        {stat.enabled && (
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-xs text-emerald-600 dark:text-emerald-400"
          >
            {t("overview.plugins.active")}
          </Badge>
        )}
      </div>
      {stat.metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stat.metrics.map((metric) => (
            <div
              key={metric.key}
              title={metric.icon}
              className="bg-muted/40 flex flex-col gap-0.5 rounded-md px-2 py-1"
            >
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {metric.displayName}
              </span>
              <span className="font-mono text-sm leading-none font-semibold">
                {formatCompactNumber(metric.value)}
                {metric.unit && (
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    {metric.unit}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/// Per-plugin runtime statistics for the overview, backed by the plugin
/// metrics API exposed over gRPC.
export function PluginStatsPanel({
  instanceId,
  canView,
}: {
  instanceId: string;
  canView: boolean;
}) {
  const { t } = useTranslation("instance");
  const { data } = useQuery({
    ...pluginStatsQueryOptions(instanceId),
    enabled: canView,
    retry: false,
  });

  const stats = data?.stats ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <BlocksIcon className="size-4" />
          {t("overview.plugins.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!canView ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("overview.plugins.noPermission")}
          </p>
        ) : stats.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("overview.plugins.empty")}
          </p>
        ) : (
          stats.map((stat) => (
            <PluginStatRow key={stat.pluginId} t={t} stat={stat} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

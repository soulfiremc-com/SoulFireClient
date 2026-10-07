import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PluginRuntimeStat } from "@/generated/soulfire/plugin_stats_pb";
import { formatCompactNumber } from "@/lib/format.ts";
import { pluginStatsQueryOptions } from "@/lib/plugin-stats-query.ts";
import { timestampToDate } from "@/lib/utils.tsx";

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
    <div className="flex flex-col gap-2">
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
          <span className="text-xs text-success-emphasis">
            {t("overview.plugins.active")}
          </span>
        )}
      </div>
      {stat.metrics.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {stat.metrics.map((metric) => (
            <div
              key={metric.key}
              title={metric.icon}
              className="flex flex-col gap-0.5"
            >
              <span className="text-muted-foreground text-xs">
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

  if (!canView || stats.length === 0) return null;

  return (
    <section
      className="flex min-w-0 flex-col gap-5"
      aria-labelledby="overview-plugins-title"
    >
      <h3 id="overview-plugins-title" className="text-sm font-medium">
        {t("overview.plugins.title")}
      </h3>
      <div className="flex flex-col gap-4">
        {stats.map((stat) => (
          <PluginStatRow key={stat.pluginId} t={t} stat={stat} />
        ))}
      </div>
    </section>
  );
}

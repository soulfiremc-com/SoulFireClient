import { NetworkIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Sparkline } from "@/components/instance-overview/sparkline.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import type {
  GetInstanceMetricsResponse,
  MetricsSnapshot,
} from "@/generated/soulfire/metrics_pb.ts";
import { formatBytesPerSecond, formatCompactNumber } from "@/lib/format.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";

const SPARK_WINDOW = 60;

type KpiTile = {
  id: string;
  label: string;
  value: string;
  series?: number[];
  color?: string;
  icon?: ReactNode;
};

/// Compact strip of headline metrics. Each tile shows a single value plus a
/// trend sparkline, replacing the old duplicated summary cards and charts.
export function KpiStrip({
  instanceInfo,
  metricsData,
  latest,
}: {
  instanceInfo: InstanceInfoQueryData;
  metricsData: GetInstanceMetricsResponse;
  latest: MetricsSnapshot | null;
}) {
  const { t } = useTranslation("instance");

  const tiles = useMemo<KpiTile[]>(() => {
    const recent = metricsData.snapshots.slice(-SPARK_WINDOW);
    const accountCount = instanceInfo.profile.accounts.length;
    const totalBots = latest?.botsTotal ?? accountCount;

    return [
      {
        id: "online",
        label: t("metrics.summary.online"),
        value: `${latest?.botsOnline ?? 0}/${totalBots}`,
        series: recent.map((s) => s.botsOnline),
        color: "var(--chart-1)",
      },
      {
        id: "accounts",
        label: t("overview.summary.accounts"),
        value: formatCompactNumber(accountCount),
        icon: <UsersIcon className="text-muted-foreground/60 size-5" />,
      },
      {
        id: "proxies",
        label: t("overview.summary.proxies"),
        value: formatCompactNumber(instanceInfo.profile.proxies.length),
        icon: <NetworkIcon className="text-muted-foreground/60 size-5" />,
      },
      {
        id: "traffic",
        label: t("metrics.summary.traffic"),
        value: latest
          ? formatBytesPerSecond(
              latest.bytesSentPerSecond + latest.bytesReceivedPerSecond,
            )
          : "-",
        series: recent.map(
          (s) => s.bytesSentPerSecond + s.bytesReceivedPerSecond,
        ),
        color: "var(--chart-2)",
      },
      {
        id: "tick",
        label: t("metrics.summary.tick"),
        value: latest ? `${latest.avgTickDurationMs.toFixed(1)}ms` : "-",
        series: recent.map((s) => s.avgTickDurationMs),
        color: "var(--chart-4)",
      },
      {
        id: "health",
        label: t("metrics.summary.health"),
        value: latest ? latest.avgHealth.toFixed(1) : "-",
        series: recent.map((s) => s.avgHealth),
        color: "var(--chart-3)",
      },
    ];
  }, [instanceInfo, metricsData.snapshots, latest, t]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <Card key={tile.id} size="sm">
          <CardContent className="flex flex-col gap-1.5 py-1">
            <span className="text-muted-foreground text-xs">{tile.label}</span>
            <span className="font-mono text-lg leading-none font-semibold">
              {tile.value}
            </span>
            <div className="flex h-8 items-end">
              {tile.series && tile.series.length >= 2 ? (
                <Sparkline data={tile.series} color={tile.color} />
              ) : (
                <div className="flex h-8 w-full items-center">{tile.icon}</div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

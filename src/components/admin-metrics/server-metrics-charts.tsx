import { useMemo } from "react";
import { t as translate } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type CustomTooltipProps,
} from "@/components/ui/chart";
import type {
  GetServerMetricsResponse,
  ServerMetricsSnapshot,
} from "@/generated/soulfire/metrics_pb";
import {
  downsampleTimeSeriesData,
  formatChartAxisTime,
  padSnapshots,
} from "@/lib/metrics-utils";

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const TIME_AXIS_PROPS = {
  dataKey: "timestampMs",
  domain: ["dataMin", "dataMax"] as const,
  interval: "preserveStartEnd" as const,
  minTickGap: 32,
  scale: "time" as const,
  tickCount: 6,
  type: "number" as const,
};

function formatTooltipLabel(payload: CustomTooltipProps["payload"]) {
  const timeLabel = payload?.[0]?.payload?.timeLabel;
  return typeof timeLabel === "string" ? timeLabel : "";
}

// ChartContainer hides the outline on the focusable chart surface, so draw a
// ring around the chart while keyboard users move through its data points.
export function ServerMetricsSummaryCards({
  data,
}: {
  data: GetServerMetricsResponse;
}) {
  const { t } = useTranslation("admin");
  const latest = data.snapshots.length > 0 ? data.snapshots.at(-1) : null;

  const items = [
    {
      label: t("overview.serverMetrics.summary.cpu"),
      value: latest
        ? latest.processCpuLoad >= 0
          ? `${(latest.processCpuLoad * 100).toFixed(1)}%`
          : "-"
        : "-",
    },
    {
      label: t("overview.serverMetrics.summary.heapUsed"),
      value: latest ? formatMB(Number(latest.heapUsedBytes)) : "-",
    },
    {
      label: t("overview.serverMetrics.summary.threads"),
      value: latest ? `${latest.threadCount}` : "-",
    },
    {
      label: t("overview.serverMetrics.summary.botsOnline"),
      value: latest
        ? `${latest.totalBotsOnline}/${latest.totalBotsTotal}`
        : "-/-",
    },
    {
      label: t("overview.serverMetrics.summary.uptime"),
      value: latest ? formatUptime(Number(latest.uptimeMs)) : "-",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="flex flex-col items-center py-2">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="font-mono text-lg font-bold">{item.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const cpuConfig = {
  process: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.process");
    },
    color: "var(--chart-1)",
  },
  system: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.system");
    },
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function CpuUsageChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          process: snapshot
            ? snapshot.processCpuLoad >= 0
              ? Number((snapshot.processCpuLoad * 100).toFixed(1))
              : 0
            : null,
          system: snapshot
            ? snapshot.systemCpuLoad >= 0
              ? Number((snapshot.systemCpuLoad * 100).toFixed(1))
              : 0
            : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.serverMetrics.cpuUsage.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={cpuConfig} className="min-h-[200px] w-full">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ChartTooltip
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent
                  {...props}
                  labelFormatter={(_label, payload) =>
                    formatTooltipLabel(payload)
                  }
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="system"
              stroke="var(--color-system)"
              fill="var(--color-system)"
              fillOpacity={0.1}
              isAnimationActive={false}
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <Area
              type="monotone"
              dataKey="process"
              stroke="var(--color-process)"
              fill="var(--color-process)"
              fillOpacity={0.3}
              isAnimationActive={false}
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const memoryConfig = {
  used: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.used");
    },
    color: "var(--chart-1)",
  },
  committed: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.committed");
    },
    color: "var(--chart-3)",
  },
  max: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.max");
    },
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

export function MemoryUsageChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          used: snapshot
            ? Number(snapshot.heapUsedBytes) / (1024 * 1024)
            : null,
          committed: snapshot
            ? Number(snapshot.heapCommittedBytes) / (1024 * 1024)
            : null,
          max: snapshot
            ? Number(snapshot.heapMaxBytes) > 0
              ? Number(snapshot.heapMaxBytes) / (1024 * 1024)
              : undefined
            : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.serverMetrics.memoryUsage.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={memoryConfig} className="min-h-[200px] w-full">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v.toFixed(0)} MB`}
            />
            <ChartTooltip
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent
                  {...props}
                  labelFormatter={(_label, payload) =>
                    formatTooltipLabel(payload)
                  }
                  formatter={(value, name, item) => (
                    <>
                      <div
                        className="size-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="flex flex-1 items-center justify-between leading-none">
                        <span className="text-muted-foreground">
                          {Object.entries(memoryConfig).find(
                            ([key]) => key === name,
                          )?.[1].label ?? name}
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {formatMB(
                            (typeof value === "number" ? value : 0) *
                              1024 *
                              1024,
                          )}
                        </span>
                      </div>
                    </>
                  )}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="max"
              stroke="var(--color-max)"
              fill="var(--color-max)"
              fillOpacity={0.05}
              isAnimationActive={false}
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <Area
              type="monotone"
              dataKey="committed"
              stroke="var(--color-committed)"
              fill="var(--color-committed)"
              fillOpacity={0.1}
              isAnimationActive={false}
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="used"
              stroke="var(--color-used)"
              fill="var(--color-used)"
              fillOpacity={0.3}
              isAnimationActive={false}
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const threadConfig = {
  total: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.total");
    },
    color: "var(--chart-1)",
  },
  daemon: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.daemon");
    },
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function ThreadCountChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          total: snapshot ? snapshot.threadCount : null,
          daemon: snapshot ? snapshot.daemonThreadCount : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.serverMetrics.threadCount.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={threadConfig} className="min-h-[200px] w-full">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <ChartTooltip
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent
                  {...props}
                  labelFormatter={(_label, payload) =>
                    formatTooltipLabel(payload)
                  }
                />
              )}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="var(--color-total)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="daemon"
              stroke="var(--color-daemon)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const botsConfig = {
  online: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.online");
    },
    color: "var(--chart-1)",
  },
  total: {
    get label() {
      return translate("admin:overview.serverMetrics.legend.total");
    },
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function AggregateBotsChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          online: snapshot ? snapshot.totalBotsOnline : null,
          total: snapshot ? snapshot.totalBotsTotal : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.serverMetrics.aggregateBots.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={botsConfig} className="min-h-[200px] w-full">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <ChartTooltip
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent
                  {...props}
                  labelFormatter={(_label, payload) =>
                    formatTooltipLabel(payload)
                  }
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--color-total)"
              fill="var(--color-total)"
              fillOpacity={0.1}
              isAnimationActive={false}
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <Area
              type="monotone"
              dataKey="online"
              stroke="var(--color-online)"
              fill="var(--color-online)"
              fillOpacity={0.3}
              isAnimationActive={false}
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

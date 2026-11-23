import { useMemo } from "react";
import type { TFunction } from "i18next";
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
  BYTES_PER_MEGABYTE,
  formatMegabytes,
  formatNumber,
  formatPercent,
} from "@/lib/format.ts";
import {
  downsampleTimeSeriesData,
  formatChartAxisTime,
  padSnapshots,
} from "@/lib/metrics-utils";

function formatMB(bytes: number): string {
  return formatMegabytes(bytes / BYTES_PER_MEGABYTE);
}

function formatDurationUnit(value: number, unit: string): string {
  return formatNumber(value, { style: "unit", unit, unitDisplay: "narrow" });
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) {
    return `${formatDurationUnit(days, "day")} ${formatDurationUnit(hours, "hour")}`;
  }
  if (hours > 0) {
    return `${formatDurationUnit(hours, "hour")} ${formatDurationUnit(minutes, "minute")}`;
  }
  return formatDurationUnit(minutes, "minute");
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
  const point: unknown = payload[0]?.payload;
  return typeof point === "object" &&
    point !== null &&
    "timeLabel" in point &&
    typeof point.timeLabel === "string"
    ? point.timeLabel
    : "";
}

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
          ? formatNumber(latest.processCpuLoad, {
              style: "percent",
              maximumFractionDigits: 1,
            })
          : "-"
        : "-",
    },
    {
      label: t("overview.serverMetrics.summary.heapUsed"),
      value: latest ? formatMB(Number(latest.heapUsedBytes)) : "-",
    },
    {
      label: t("overview.serverMetrics.summary.threads"),
      value: latest ? formatNumber(latest.threadCount) : "-",
    },
    {
      label: t("overview.serverMetrics.summary.botsOnline"),
      value: latest
        ? `${formatNumber(latest.totalBotsOnline)}/${formatNumber(latest.totalBotsTotal)}`
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

function cpuConfig(t: TFunction<"admin">) {
  return {
    process: {
      label: t("overview.serverMetrics.legend.process"),
      color: "var(--chart-1)",
    },
    system: {
      label: t("overview.serverMetrics.legend.system"),
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;
}

export function CpuUsageChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const cpuChartConfig = cpuConfig(t);
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          // A negative load means the JVM could not measure it. Leave a gap
          // instead of drawing an idle CPU.
          process:
            snapshot && snapshot.processCpuLoad >= 0
              ? Number((snapshot.processCpuLoad * 100).toFixed(1))
              : null,
          system:
            snapshot && snapshot.systemCpuLoad >= 0
              ? Number((snapshot.systemCpuLoad * 100).toFixed(1))
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
        <ChartContainer
          config={cpuChartConfig}
          className="min-h-[200px] w-full"
        >
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
              tickFormatter={(v: number) => formatPercent(v)}
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

function memoryConfig(t: TFunction<"admin">) {
  return {
    used: {
      label: t("overview.serverMetrics.legend.used"),
      color: "var(--chart-1)",
    },
    committed: {
      label: t("overview.serverMetrics.legend.committed"),
      color: "var(--chart-3)",
    },
    max: {
      label: t("overview.serverMetrics.legend.max"),
      color: "var(--chart-4)",
    },
  } satisfies ChartConfig;
}

export function MemoryUsageChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const memoryChartConfig = memoryConfig(t);
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          used: snapshot
            ? Number(snapshot.heapUsedBytes) / BYTES_PER_MEGABYTE
            : null,
          committed: snapshot
            ? Number(snapshot.heapCommittedBytes) / BYTES_PER_MEGABYTE
            : null,
          max: snapshot
            ? Number(snapshot.heapMaxBytes) > 0
              ? Number(snapshot.heapMaxBytes) / BYTES_PER_MEGABYTE
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
        <ChartContainer
          config={memoryChartConfig}
          className="min-h-[200px] w-full"
        >
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => formatMegabytes(v)}
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
                          {Object.entries(memoryChartConfig).find(
                            ([key]) => key === name,
                          )?.[1].label ?? name}
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {formatMegabytes(
                            typeof value === "number" ? value : 0,
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

function threadConfig(t: TFunction<"admin">) {
  return {
    total: {
      label: t("overview.serverMetrics.legend.total"),
      color: "var(--chart-1)",
    },
    daemon: {
      label: t("overview.serverMetrics.legend.daemon"),
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;
}

export function ThreadCountChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const threadChartConfig = threadConfig(t);
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
        <ChartContainer
          config={threadChartConfig}
          className="min-h-[200px] w-full"
        >
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

function botsConfig(t: TFunction<"admin">) {
  return {
    online: {
      label: t("overview.serverMetrics.legend.online"),
      color: "var(--chart-1)",
    },
    total: {
      label: t("overview.serverMetrics.legend.total"),
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig;
}

export function AggregateBotsChart({
  snapshots,
}: {
  snapshots: ServerMetricsSnapshot[];
}) {
  const { t } = useTranslation("admin");
  const botsChartConfig = botsConfig(t);
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
        <ChartContainer
          config={botsChartConfig}
          className="min-h-[200px] w-full"
        >
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

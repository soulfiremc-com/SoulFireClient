import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
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
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type {
  GetInstanceMetricsResponse,
  MetricsSnapshot,
} from "@/generated/soulfire/metrics_pb";
import {
  downsampleTimeSeriesData,
  formatChartAxisTime,
  padSnapshots,
} from "@/lib/metrics-utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatNumber(n: number): string {
  if (n < 1000) return n.toFixed(0);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const TIME_AXIS_PROPS = {
  dataKey: "timestampMs",
  domain: ["dataMin", "dataMax"] as const,
  interval: "preserveStartEnd" as const,
  minTickGap: 32,
  scale: "time" as const,
  tickCount: 6,
  type: "number" as const,
};

const TIME_SERIES_CHART_CLASS_NAME = "aspect-auto h-52 min-h-0 w-full";
const COMPACT_CHART_CLASS_NAME = "aspect-auto h-44 min-h-0 w-full";
const PIE_CHART_CLASS_NAME = "mx-auto h-44 min-h-0 max-w-44";

function formatTooltipLabel(payload: CustomTooltipProps["payload"]) {
  const timeLabel = payload?.[0]?.payload?.timeLabel;
  return typeof timeLabel === "string" ? timeLabel : "";
}

function EmptyMetricCard({ title }: { title: string }) {
  const { t } = useTranslation("instance");
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Empty className="border-0 px-0 py-8">
          <EmptyHeader className="gap-1">
            <EmptyTitle className="text-sm">
              {t("metrics.empty.noData")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

// Summary cards at the top
export function MetricsSummaryCards({
  data,
}: {
  data: GetInstanceMetricsResponse;
}) {
  const { t } = useTranslation("instance");
  const latest =
    data.snapshots.length > 0
      ? data.snapshots[data.snapshots.length - 1]
      : null;

  const items = [
    {
      key: "online",
      label: t("metrics.summary.online"),
      value: latest ? `${latest.botsOnline}/${latest.botsTotal}` : "-/-",
    },
    {
      key: "packets",
      label: t("metrics.summary.packetsPerSecond"),
      value: latest
        ? formatNumber(
            latest.packetsSentPerSecond + latest.packetsReceivedPerSecond,
          )
        : "-",
    },
    {
      key: "traffic",
      label: t("metrics.summary.traffic"),
      value: latest
        ? formatBytes(latest.bytesSentPerSecond + latest.bytesReceivedPerSecond)
        : "-",
    },
    {
      key: "health",
      label: t("metrics.summary.health"),
      value: latest ? latest.avgHealth.toFixed(1) : "-",
    },
    {
      key: "tick",
      label: t("metrics.summary.tick"),
      value: latest ? `${latest.avgTickDurationMs.toFixed(1)}ms` : "-",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {items.map((item) => (
        <Card key={item.key} size="sm">
          <CardContent className="flex flex-col items-center py-2">
            <span className="text-muted-foreground text-xs">{item.label}</span>
            <span className="font-mono text-lg font-bold">{item.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Bots Online area chart
export function BotsOnlineChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const botsOnlineConfig = {
    online: { label: t("metrics.botsOnline.online"), color: "var(--chart-1)" },
    total: { label: t("metrics.botsOnline.total"), color: "var(--chart-3)" },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          online: snapshot ? snapshot.botsOnline : null,
          total: snapshot ? snapshot.botsTotal : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.botsOnline.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={botsOnlineConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
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
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// Network traffic (packets/s)
export function NetworkTrafficChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const networkConfig = {
    sent: { label: t("metrics.packets.sent"), color: "var(--chart-1)" },
    received: { label: t("metrics.packets.received"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          sent: snapshot ? Math.round(snapshot.packetsSentPerSecond) : null,
          received: snapshot
            ? Math.round(snapshot.packetsReceivedPerSecond)
            : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{t("metrics.packets.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={networkConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
        >
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis tick={{ fontSize: 10 }} />
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
              dataKey="sent"
              stroke="var(--color-sent)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="received"
              stroke="var(--color-received)"
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

// Bandwidth (bytes/s)
export function BandwidthChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const bandwidthConfig = {
    upload: { label: t("metrics.bandwidth.upload"), color: "var(--chart-1)" },
    download: {
      label: t("metrics.bandwidth.download"),
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          upload: snapshot ? snapshot.bytesSentPerSecond : null,
          download: snapshot ? snapshot.bytesReceivedPerSecond : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.bandwidth.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={bandwidthConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
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
              tickFormatter={(v: number) => formatBytes(v).replace("/s", "")}
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
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="flex flex-1 items-center justify-between leading-none">
                        <span className="text-muted-foreground">
                          {bandwidthConfig[name as keyof typeof bandwidthConfig]
                            ?.label ?? name}
                        </span>
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {formatBytes(typeof value === "number" ? value : 0)}
                        </span>
                      </div>
                    </>
                  )}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="upload"
              stroke="var(--color-upload)"
              fill="var(--color-upload)"
              fillOpacity={0.3}
              isAnimationActive={false}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="download"
              stroke="var(--color-download)"
              fill="var(--color-download)"
              fillOpacity={0.2}
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

// Tick duration
export function TickDurationChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const tickConfig = {
    avg: { label: t("metrics.tick.avg"), color: "var(--chart-1)" },
    max: { label: t("metrics.tick.max"), color: "var(--chart-4)" },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          avg: snapshot ? Number(snapshot.avgTickDurationMs.toFixed(2)) : null,
          max: snapshot ? Number(snapshot.maxTickDurationMs.toFixed(2)) : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{t("metrics.tick.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={tickConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
        >
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v}ms`}
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
            <Line
              type="monotone"
              dataKey="avg"
              stroke="var(--color-avg)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="max"
              stroke="var(--color-max)"
              strokeWidth={1}
              strokeDasharray="4 2"
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

// Health & Food line chart
export function HealthFoodChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const healthFoodConfig = {
    health: { label: t("metrics.healthFood.health"), color: "var(--chart-1)" },
    food: { label: t("metrics.healthFood.food"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          health: snapshot ? Number(snapshot.avgHealth.toFixed(1)) : null,
          food: snapshot ? Number(snapshot.avgFoodLevel.toFixed(1)) : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.healthFood.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={healthFoodConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
        >
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis domain={[0, 20]} tick={{ fontSize: 10 }} />
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
              dataKey="health"
              stroke="var(--color-health)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="food"
              stroke="var(--color-food)"
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

// Chunks & Entities area chart
export function ChunksEntitiesChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const chunksEntitiesConfig = {
    chunks: {
      label: t("metrics.chunksEntities.chunks"),
      color: "var(--chart-1)",
    },
    entities: {
      label: t("metrics.chunksEntities.entities"),
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          timestampMs,
          timeLabel,
          chunks: snapshot ? snapshot.totalLoadedChunks : null,
          entities: snapshot ? snapshot.totalTrackedEntities : null,
        })),
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.chunksEntities.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chunksEntitiesConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
        >
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              {...TIME_AXIS_PROPS}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatChartAxisTime(Number(value))}
            />
            <YAxis tick={{ fontSize: 10 }} />
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
              dataKey="chunks"
              stroke="var(--color-chunks)"
              fill="var(--color-chunks)"
              fillOpacity={0.3}
              isAnimationActive={false}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="entities"
              stroke="var(--color-entities)"
              fill="var(--color-entities)"
              fillOpacity={0.2}
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

// Connection events bar chart
export function ConnectionEventsChart({
  snapshots,
}: {
  snapshots: MetricsSnapshot[];
}) {
  const { t } = useTranslation("instance");
  const connectionConfig = {
    connections: {
      label: t("metrics.connections.connections"),
      color: "var(--chart-1)",
    },
    disconnections: {
      label: t("metrics.connections.disconnections"),
      color: "var(--chart-4)",
    },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      downsampleTimeSeriesData(
        padSnapshots(snapshots).map(({ timestampMs, timeLabel, snapshot }) => ({
          time: formatChartAxisTime(timestampMs),
          timestampMs,
          timeLabel,
          connections: snapshot ? snapshot.connections : null,
          disconnections: snapshot ? snapshot.disconnections : null,
        })),
        { mode: "sum" },
      ),
    [snapshots],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.connections.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={connectionConfig}
          className={TIME_SERIES_CHART_CLASS_NAME}
        >
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              interval="preserveStartEnd"
              tick={{ fontSize: 10 }}
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
            <Bar
              dataKey="connections"
              fill="var(--color-connections)"
              isAnimationActive={false}
              radius={2}
            />
            <Bar
              dataKey="disconnections"
              fill="var(--color-disconnections)"
              isAnimationActive={false}
              radius={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// Health distribution histogram
const HEALTH_BUCKETS = [
  "0-2",
  "2-4",
  "4-6",
  "6-8",
  "8-10",
  "10-12",
  "12-14",
  "14-16",
  "16-18",
  "18-20",
];

export function HealthDistributionChart({
  histogram,
}: {
  histogram: number[];
}) {
  const { t } = useTranslation("instance");
  const healthDistConfig = {
    count: {
      label: t("metrics.healthDistribution.bots"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      HEALTH_BUCKETS.map((label, i) => ({
        bucket: label,
        count: histogram[i] ?? 0,
      })),
    [histogram],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.healthDistribution.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={healthDistConfig}
          className={COMPACT_CHART_CLASS_NAME}
        >
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <ChartTooltip
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent {...props} />
              )}
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              isAnimationActive={false}
              radius={2}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// Dimension pie chart
export function DimensionPieChart({
  dimensionCounts,
}: {
  dimensionCounts: Record<string, number>;
}) {
  const { t } = useTranslation("instance");
  const dimensionPieConfig = {
    bots: { label: t("metrics.dimensions.bots") },
  } satisfies ChartConfig;
  const chartData = useMemo(() => {
    const entries = Object.entries(dimensionCounts);
    if (entries.length === 0) return [];
    return entries.map(([dim, count], i) => ({
      dimension: dim.replace("minecraft:", ""),
      bots: count,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [dimensionCounts]);

  if (chartData.length === 0) {
    return <EmptyMetricCard title={t("metrics.dimensions.title")} />;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.dimensions.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={dimensionPieConfig}
          className={PIE_CHART_CLASS_NAME}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent {...props} nameKey="dimension" />
              )}
            />
            <Pie
              data={chartData}
              dataKey="bots"
              nameKey="dimension"
              innerRadius={40}
              isAnimationActive={false}
              strokeWidth={3}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// Game mode pie chart
export function GameModePieChart({
  gameModeCounts,
}: {
  gameModeCounts: Record<string, number>;
}) {
  const { t } = useTranslation("instance");
  const gameModePieConfig = {
    bots: { label: t("metrics.gameModes.bots") },
  } satisfies ChartConfig;
  const chartData = useMemo(() => {
    const entries = Object.entries(gameModeCounts);
    if (entries.length === 0) return [];
    return entries.map(([mode, count], i) => ({
      mode: mode.charAt(0) + mode.slice(1).toLowerCase(),
      bots: count,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [gameModeCounts]);

  if (chartData.length === 0) {
    return <EmptyMetricCard title={t("metrics.gameModes.title")} />;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.gameModes.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={gameModePieConfig}
          className={PIE_CHART_CLASS_NAME}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent {...props} nameKey="mode" />
              )}
            />
            <Pie
              data={chartData}
              dataKey="bots"
              nameKey="mode"
              innerRadius={40}
              isAnimationActive={false}
              strokeWidth={3}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// Position scatter chart
export function PositionScatterChart({
  positions,
}: {
  positions: { x: number; z: number; dimension: string }[];
}) {
  const { t } = useTranslation("instance");
  const positionConfig = {
    position: { label: t("metrics.positions.bot"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const chartData = useMemo(
    () =>
      positions.map((p) => ({
        x: Math.round(p.x),
        z: Math.round(p.z),
        dimension: p.dimension.replace("minecraft:", ""),
      })),
    [positions],
  );

  if (chartData.length === 0) {
    return <EmptyMetricCard title={t("metrics.positions.title")} />;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("metrics.positions.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={positionConfig}
          className={COMPACT_CHART_CLASS_NAME}
        >
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" name="X" type="number" tick={{ fontSize: 10 }} />
            <YAxis dataKey="z" name="Z" type="number" tick={{ fontSize: 10 }} />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent {...props} />
              )}
            />
            <Scatter
              data={chartData}
              fill="var(--color-position)"
              isAnimationActive={false}
              shape="circle"
            />
          </ScatterChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

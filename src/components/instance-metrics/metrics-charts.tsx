import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
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
import type { MetricsSnapshot } from "@/generated/soulfire/metrics_pb";
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

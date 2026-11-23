import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pie, PieChart } from "recharts";
import { ChartBreakdown } from "@/components/chart-breakdown.tsx";
import {
  BandwidthChart,
  PositionScatterChart,
  TickDurationChart,
} from "@/components/instance-metrics/metrics-charts.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type CustomTooltipProps,
} from "@/components/ui/chart.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import type { GetInstanceMetricsResponse } from "@/generated/soulfire/metrics_pb";

// Each slice color pairs a chart fill with the matching swatch utility.
const PIE_COLORS = [
  { fill: "var(--chart-1)", swatch: "bg-chart-1" },
  { fill: "var(--chart-2)", swatch: "bg-chart-2" },
  { fill: "var(--chart-3)", swatch: "bg-chart-3" },
  { fill: "var(--chart-4)", swatch: "bg-chart-4" },
  { fill: "var(--chart-5)", swatch: "bg-chart-5" },
] as const;

function pieColor(index: number) {
  return PIE_COLORS[index % PIE_COLORS.length] ?? PIE_COLORS[0];
}

function MiniDonut({
  label,
  data,
}: {
  label: string;
  data: { name: string; value: number; fill: string; swatch: string }[];
}) {
  const { t } = useTranslation("instance");
  const config = useMemo<ChartConfig>(() => ({ value: { label } }), [label]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {data.length === 0 ? (
        <div className="flex h-36 items-center text-xs text-muted-foreground">
          {t("metrics.empty.noData")}
        </div>
      ) : (
        <ChartContainer config={config} className="mx-auto h-36 max-w-36">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={(props: CustomTooltipProps) => (
                <ChartTooltipContent {...props} nameKey="name" />
              )}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={34}
              isAnimationActive={false}
              strokeWidth={3}
            />
          </PieChart>
        </ChartContainer>
      )}
      {data.length > 0 && (
        <ChartBreakdown
          className="flex-col items-start"
          items={data.map((entry) => ({
            id: entry.name,
            label: entry.name,
            value: entry.value,
            swatchClassName: entry.swatch,
          }))}
        />
      )}
    </div>
  );
}

// The server sends game mode enum names as map keys.
function gameModeLabel(mode: string, t: TFunction<"instance">): string {
  switch (mode) {
    case "SURVIVAL": {
      return t("bots.statsPanel.survival");
    }
    case "CREATIVE": {
      return t("bots.statsPanel.creative");
    }
    case "ADVENTURE": {
      return t("bots.statsPanel.adventure");
    }
    case "SPECTATOR": {
      return t("bots.statsPanel.spectator");
    }
    case "": {
      return t("bots.statsPanel.unknown");
    }
    default: {
      // Show modes this client does not know by their server name.
      return mode.charAt(0) + mode.slice(1).toLowerCase();
    }
  }
}

function WorldCompositionCard({
  distributions,
}: {
  distributions: GetInstanceMetricsResponse["distributions"];
}) {
  const { t } = useTranslation("instance");

  const dimensionData = useMemo(
    () =>
      Object.entries(distributions?.dimensionCounts ?? {}).map(
        ([dim, count], index) => ({
          name: dim.replace("minecraft:", ""),
          value: count,
          fill: pieColor(index).fill,
          swatch: pieColor(index).swatch,
        }),
      ),
    [distributions?.dimensionCounts],
  );

  const gameModeData = useMemo(
    () =>
      Object.entries(distributions?.gameModeCounts ?? {}).map(
        ([mode, count], index) => ({
          name: gameModeLabel(mode, t),
          value: count,
          fill: pieColor(index).fill,
          swatch: pieColor(index).swatch,
        }),
      ),
    [distributions?.gameModeCounts, t],
  );

  if (dimensionData.length === 0 && gameModeData.length === 0) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">
            {t("overview.detailed.composition")}
          </CardTitle>
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

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.detailed.composition")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <MiniDonut
            label={t("metrics.dimensions.title")}
            data={dimensionData}
          />
          <MiniDonut label={t("metrics.gameModes.title")} data={gameModeData} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DetailedMetricsCharts({
  metricsData,
}: {
  metricsData: GetInstanceMetricsResponse;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
      <TickDurationChart snapshots={metricsData.snapshots} />
      <BandwidthChart snapshots={metricsData.snapshots} />
      <PositionScatterChart
        positions={metricsData.distributions?.botPositions ?? []}
      />
      <WorldCompositionCard distributions={metricsData.distributions} />
    </div>
  );
}

import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pie, PieChart } from "recharts";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import type { GetInstanceMetricsResponse } from "@/generated/soulfire/metrics_pb.ts";
import { cn } from "@/lib/utils.tsx";

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function MiniDonut({
  label,
  data,
}: {
  label: string;
  data: { name: string; value: number; fill: string }[];
}) {
  const config = useMemo<ChartConfig>(() => ({ value: { label } }), [label]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {data.length === 0 ? (
        <div className="text-muted-foreground flex h-36 items-center text-xs">
          —
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
    </div>
  );
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
          fill: PIE_COLORS[index % PIE_COLORS.length],
        }),
      ),
    [distributions?.dimensionCounts],
  );

  const gameModeData = useMemo(
    () =>
      Object.entries(distributions?.gameModeCounts ?? {}).map(
        ([mode, count], index) => ({
          name: mode.charAt(0) + mode.slice(1).toLowerCase(),
          value: count,
          fill: PIE_COLORS[index % PIE_COLORS.length],
        }),
      ),
    [distributions?.gameModeCounts],
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

/// Collapsed-by-default section holding the trimmed set of detailed charts.
export function DetailedMetrics({
  metricsData,
}: {
  metricsData: GetInstanceMetricsResponse;
}) {
  const { t } = useTranslation("instance");
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="hover:bg-muted/50 ring-foreground/10 flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium ring-1 transition-colors">
        {t("overview.detailed.title")}
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          <TickDurationChart snapshots={metricsData.snapshots} />
          <BandwidthChart snapshots={metricsData.snapshots} />
          <PositionScatterChart
            positions={metricsData.distributions?.botPositions ?? []}
          />
          <WorldCompositionCard distributions={metricsData.distributions} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

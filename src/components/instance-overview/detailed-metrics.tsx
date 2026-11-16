import { ChevronDownIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { GetInstanceMetricsResponse } from "@/generated/soulfire/metrics_pb";
import { cn } from "@/lib/utils.tsx";

// The charts pull in Recharts, so load them when the section opens.
const loadDetailedMetricsCharts = () =>
  import("@/components/instance-overview/detailed-metrics-charts.tsx");
const DetailedMetricsCharts = lazy(loadDetailedMetricsCharts);

function DetailedMetricsSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
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
      <CollapsibleTrigger
        render={<Button variant="ghost" size="sm" />}
        onPointerEnter={() => void loadDetailedMetricsCharts()}
        onFocus={() => void loadDetailedMetricsCharts()}
      >
        <ChevronDownIcon
          data-icon="inline-start"
          className={cn("transition-transform", open && "rotate-180")}
        />
        {t("overview.detailed.title")}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <Suspense fallback={<DetailedMetricsSkeleton />}>
          <DetailedMetricsCharts metricsData={metricsData} />
        </Suspense>
      </CollapsibleContent>
    </Collapsible>
  );
}

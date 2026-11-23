import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { MetricsSnapshot } from "@/generated/soulfire/metrics_pb";
import { formatBytesPerSecond, formatMilliseconds } from "@/lib/format.ts";

/** Live traffic and tick time, shown next to the fleet headline. */
export function OverviewSummary({
  latest,
  metricsPending,
}: {
  latest: MetricsSnapshot | undefined;
  metricsPending: boolean;
}) {
  const { t } = useTranslation("instance");

  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
      <div className="flex items-center gap-2">
        <dt className="text-muted-foreground">
          {t("metrics.summary.traffic")}
        </dt>
        <dd className="font-mono tabular-nums">
          {metricsPending ? (
            <Skeleton className="h-4 w-16" />
          ) : latest ? (
            formatBytesPerSecond(
              latest.bytesSentPerSecond + latest.bytesReceivedPerSecond,
            )
          ) : (
            "-"
          )}
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className="text-muted-foreground">{t("metrics.summary.tick")}</dt>
        <dd className="font-mono tabular-nums">
          {metricsPending ? (
            <Skeleton className="h-4 w-12" />
          ) : latest ? (
            formatMilliseconds(latest.avgTickDurationMs, 1)
          ) : (
            "-"
          )}
        </dd>
      </div>
    </dl>
  );
}

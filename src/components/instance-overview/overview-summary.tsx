import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { MetricsSnapshot } from "@/generated/soulfire/metrics_pb";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import { formatBytesPerSecond } from "@/lib/format.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";

export function OverviewSummary({
  instanceInfo,
  latest,
  metricsPending,
}: {
  instanceInfo: InstanceInfoQueryData;
  latest: MetricsSnapshot | undefined;
  metricsPending: boolean;
}) {
  const { t } = useTranslation("instance");
  const { data, isPending } = useQuery(botStatusQueryOptions(instanceInfo.id));
  const accountIds = new Set(
    instanceInfo.profile.accounts.map((account) => account.profileId),
  );
  const online = data?.bots.filter(
    (bot) => accountIds.has(bot.profileId) && bot.isOnline,
  ).length;

  return (
    <dl className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
      <div className="flex items-center gap-2">
        <dt className="text-muted-foreground">{t("metrics.summary.online")}</dt>
        <dd className="flex items-center gap-2 font-medium tabular-nums">
          {isPending ? (
            <Skeleton className="h-4 w-10" />
          ) : (
            <>
              <span
                className={
                  online
                    ? "bg-success size-1.5 rounded-full"
                    : "bg-muted-foreground size-1.5 rounded-full"
                }
              />
              {data ? `${online}/${accountIds.size}` : "-"}
            </>
          )}
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className="text-muted-foreground">
          {t("metrics.summary.traffic")}
        </dt>
        <dd className="font-mono text-xs tabular-nums">
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
        <dd className="font-mono text-xs tabular-nums">
          {metricsPending ? (
            <Skeleton className="h-4 w-12" />
          ) : latest ? (
            `${latest.avgTickDurationMs.toFixed(1)} ms`
          ) : (
            "-"
          )}
        </dd>
      </div>
    </dl>
  );
}

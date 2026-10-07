import { create } from "@bufbuild/protobuf";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SquareTerminalIcon } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ControlsMenu from "@/components/controls-menu.tsx";
import { ActivityTimeline } from "@/components/instance-overview/activity-timeline.tsx";
import { BotListPreview } from "@/components/instance-overview/bot-list-preview.tsx";
import { DetailedMetrics } from "@/components/instance-overview/detailed-metrics.tsx";
import { OverviewSummary } from "@/components/instance-overview/overview-summary.tsx";
import { LiveFeed } from "@/components/instance-overview/live-feed.tsx";
import { PluginStatsPanel } from "@/components/instance-overview/plugin-stats-panel.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import {
  InstanceLogScopeSchema,
  type LogScope,
  LogScopeSchema,
} from "@/generated/soulfire/logs_pb";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasInstancePermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/instance/$instance/")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.overview"), {
      kind: "dynamic",
      name: "house",
    }),
  component: Overview,
});

const OVERVIEW_CONTROL_SKELETON_IDS = [
  "control-1",
  "control-2",
  "control-3",
] as const;
function Overview() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[{ id: "controls", content: t("breadcrumbs.controls") }]}
      pageName={t("pageName.overview")}
      loadingSkeleton={<OverviewSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  return (
    <div className="flex w-full flex-col gap-5 py-2 xl:px-2">
      <Suspense fallback={<OverviewHeaderSkeleton />}>
        <OverviewHeaderSection />
      </Suspense>
      <Suspense fallback={<OverviewContentSkeleton />}>
        <OverviewContentSection />
      </Suspense>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex w-full flex-col gap-5 py-2 xl:px-2">
      <OverviewHeaderSkeleton />
      <OverviewContentSkeleton />
    </div>
  );
}

function OverviewHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-row items-center gap-2">
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="flex flex-wrap gap-2">
        {OVERVIEW_CONTROL_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-8 w-20 rounded-lg" />
        ))}
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

function OverviewContentSkeleton() {
  const { t } = useTranslation("instance");
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-wrap gap-8 text-sm">
        {["online", "traffic", "tick"].map((metric) => (
          <div key={metric} className="flex items-center gap-2">
            <dt className="text-muted-foreground">
              {t(`metrics.summary.${metric}`)}
            </dt>
            <dd>
              <Skeleton className="h-4 w-12" />
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium">
            {t("overview.liveFeed.title")}
          </h3>
          <div className="bg-card rounded-md border p-4">
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>{t("overview.liveFeed.columns.bot")}</span>
              <span>{t("overview.liveFeed.columns.message")}</span>
            </div>
            <div className="h-48 pt-4">
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </section>
        <section className="flex flex-col gap-5">
          <h3 className="text-sm font-medium">{t("overview.bots.title")}</h3>
          <Skeleton className="h-4 w-32" />
        </section>
      </div>
    </div>
  );
}

function OverviewHeaderSection() {
  const { t } = useTranslation("common");
  const { t: tInstance } = useTranslation("instance");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const [logsOpen, setLogsOpen] = useState(false);
  const logScope = useMemo<LogScope>(
    () =>
      create(LogScopeSchema, {
        scope: {
          case: "instance",
          value: create(InstanceLogScopeSchema, {
            instanceId: instanceInfo.id,
          }),
        },
      }),
    [instanceInfo.id],
  );
  const canViewLogs = hasInstancePermission(
    instanceInfo,
    InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-row items-center gap-2">
        <h2 className="max-w-64 truncate text-xl font-semibold">
          {instanceInfo.friendlyName}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Suspense fallback={<Skeleton className="h-8 w-56" />}>
          <ControlsMenu />
        </Suspense>
        {canViewLogs && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogsOpen(true)}
            >
              <SquareTerminalIcon data-icon="inline-start" />
              {t("pageName.logs")}
            </Button>
            <Credenza open={logsOpen} onOpenChange={setLogsOpen}>
              <CredenzaContent className="overflow-hidden sm:max-w-5xl">
                <CredenzaHeader>
                  <CredenzaTitle>{t("pageName.logs")}</CredenzaTitle>
                  <CredenzaDescription>
                    {tInstance("overview.logsDescription")}
                  </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody className="pb-4 md:px-0 md:pb-0">
                  {logsOpen && <TerminalComponent scope={logScope} />}
                </CredenzaBody>
              </CredenzaContent>
            </Credenza>
          </>
        )}
      </div>
    </div>
  );
}

function OverviewContentSection() {
  const { instanceInfoQueryOptions, metricsQueryOptions } =
    Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const canReadBots = hasInstancePermission(
    instanceInfo,
    InstancePermission.READ_BOT_INFO,
  );
  const canViewAuditLog = hasInstancePermission(
    instanceInfo,
    InstancePermission.READ_INSTANCE_AUDIT_LOGS,
  );
  const { data: metricsData, isPending } = useQuery({
    ...metricsQueryOptions,
    enabled: canReadBots,
  });
  const latest = metricsData?.snapshots[metricsData.snapshots.length - 1];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {canReadBots && (
        <OverviewSummary
          instanceInfo={instanceInfo}
          latest={latest}
          metricsPending={isPending}
        />
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <LiveFeed
          key={instanceInfo.id}
          instanceId={instanceInfo.id}
          canWatch={canReadBots}
        />
        {(canReadBots || canViewAuditLog) && (
          <div className="flex min-w-0 flex-col gap-7">
            {canReadBots && <BotListPreview instanceInfo={instanceInfo} />}
            <ActivityTimeline
              instanceId={instanceInfo.id}
              canView={canViewAuditLog}
            />
            <PluginStatsPanel
              instanceId={instanceInfo.id}
              canView={canReadBots}
            />
          </div>
        )}
      </div>
      {canReadBots && metricsData && metricsData.snapshots.length >= 2 && (
        <DetailedMetrics metricsData={metricsData} />
      )}
    </div>
  );
}

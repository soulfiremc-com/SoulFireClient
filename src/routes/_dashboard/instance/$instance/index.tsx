import { create } from "@bufbuild/protobuf";
import { InstancePermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  InstanceLogScopeSchema,
  type LogScope,
  LogScopeSchema,
} from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import type {
  GetInstanceMetricsResponse,
  MetricsSnapshot,
} from "@soulfiremc/sdk/generated/soulfire/metrics_pb";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SquareTerminalIcon } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotFleetSummaryBadge } from "@/components/bot-fleet-summary.tsx";
import ControlsMenu from "@/components/controls-menu.tsx";
import { ActivityTimeline } from "@/components/instance-overview/activity-timeline.tsx";
import {
  BotCardSkeleton,
  BotGridPreview,
} from "@/components/instance-overview/bot-grid.tsx";
import { DetailedMetrics } from "@/components/instance-overview/detailed-metrics.tsx";
import { KpiStrip } from "@/components/instance-overview/kpi-strip.tsx";
import { LiveFeed } from "@/components/instance-overview/live-feed.tsx";
import { PluginStatsPanel } from "@/components/instance-overview/plugin-stats-panel.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import { Skeleton } from "@/components/ui/skeleton";
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
const OVERVIEW_KPI_SKELETON_IDS = [
  "kpi-1",
  "kpi-2",
  "kpi-3",
  "kpi-4",
  "kpi-5",
  "kpi-6",
] as const;
const OVERVIEW_BOT_SKELETON_IDS = [
  "preview-1",
  "preview-2",
  "preview-3",
  "preview-4",
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
    <div className="flex h-full w-full grow flex-col gap-3">
      <Suspense fallback={<OverviewHeaderSkeleton />}>
        <OverviewHeaderSection />
      </Suspense>
      <Suspense fallback={<OverviewMetricsSkeleton />}>
        <OverviewMetricsSection />
      </Suspense>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex h-full w-full grow flex-col gap-3">
      <OverviewHeaderSkeleton />
      <OverviewMetricsSkeleton />
    </div>
  );
}

function OverviewHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-row items-center gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-16" />
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

function OverviewMetricsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-56 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {OVERVIEW_KPI_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function BotsPreviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {OVERVIEW_BOT_SKELETON_IDS.map((id) => (
        <BotCardSkeleton key={id} />
      ))}
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
        <BotFleetSummaryBadge summary={instanceInfo.botSummary} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ControlsMenu />
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

function OverviewMetricsSection() {
  const { t } = useTranslation("instance");
  const { instanceInfoQueryOptions, metricsQueryOptions } =
    Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { data: metricsData } = useSuspenseQuery(metricsQueryOptions);

  const hasMetricsPermission = hasInstancePermission(
    instanceInfo,
    InstancePermission.READ_BOT_INFO,
  );
  const canViewAuditLog = hasInstancePermission(
    instanceInfo,
    InstancePermission.READ_INSTANCE_AUDIT_LOGS,
  );

  const hasDesiredBots = (instanceInfo.botSummary?.desiredBots ?? 0) > 0;
  const hasSnapshots = metricsData.snapshots.length >= 2;
  const showMetrics = hasMetricsPermission && (hasDesiredBots || hasSnapshots);
  const latest = getLatestSnapshot(metricsData);

  return (
    <div className="flex flex-col gap-3">
      <LiveFeed instanceId={instanceInfo.id} canWatch={hasMetricsPermission} />

      {hasMetricsPermission && (
        <KpiStrip
          instanceInfo={instanceInfo}
          metricsData={metricsData}
          latest={latest}
        />
      )}

      {hasMetricsPermission && !showMetrics && (
        <Card size="sm">
          <CardContent className="text-muted-foreground py-3 text-sm">
            {t("overview.metricsUnavailable.inactive")}
          </CardContent>
        </Card>
      )}

      {hasMetricsPermission && (
        <Card size="sm">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">
              {t("overview.bots.title")}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/instance/$instance/bots"
                  params={{ instance: instanceInfo.id }}
                />
              }
            >
              {t("overview.bots.viewAllShort")}
            </Button>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<BotsPreviewSkeleton />}>
              <BotGridPreview instanceInfo={instanceInfo} limit={8} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
        <ActivityTimeline
          instanceId={instanceInfo.id}
          canView={canViewAuditLog}
        />
        <PluginStatsPanel
          instanceId={instanceInfo.id}
          canView={hasMetricsPermission}
        />
      </div>

      {showMetrics && hasSnapshots && (
        <DetailedMetrics metricsData={metricsData} />
      )}
    </div>
  );
}

function getLatestSnapshot(
  metricsData: GetInstanceMetricsResponse,
): MetricsSnapshot | null {
  if (metricsData.snapshots.length === 0) {
    return null;
  }

  return metricsData.snapshots[metricsData.snapshots.length - 1];
}

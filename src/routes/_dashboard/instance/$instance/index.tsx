import { create } from "@bufbuild/protobuf";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ControlsMenu from "@/components/controls-menu.tsx";
import {
  BandwidthChart,
  BotsOnlineChart,
  ChunksEntitiesChart,
  ConnectionEventsChart,
  DimensionPieChart,
  GameModePieChart,
  HealthDistributionChart,
  HealthFoodChart,
  MetricsSummaryCards,
  NetworkTrafficChart,
  PositionScatterChart,
  TickDurationChart,
} from "@/components/instance-metrics/metrics-charts.tsx";
import { InstanceStateIndicator } from "@/components/instance-state-indicator.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { InstancePermission } from "@/generated/soulfire/common_pb.ts";
import { InstanceState } from "@/generated/soulfire/instance_pb.ts";
import {
  InstanceLogScopeSchema,
  type LogScope,
  LogScopeSchema,
} from "@/generated/soulfire/logs_pb.ts";
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

const OVERVIEW_SUMMARY_SKELETON_IDS = [
  "summary-1",
  "summary-2",
  "summary-3",
  "summary-4",
] as const;
const OVERVIEW_CHART_SKELETON_IDS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
] as const;
const OVERVIEW_CONTROL_SKELETON_IDS = [
  "control-1",
  "control-2",
  "control-3",
  "control-4",
] as const;

function OverviewSkeleton() {
  return (
    <div className="flex h-full w-full grow flex-col gap-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-center gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-[calc(75vh-8rem)] w-full rounded-md" />
      </div>
      <div className="flex flex-row gap-2">
        {OVERVIEW_CONTROL_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-9 w-20" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OVERVIEW_SUMMARY_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        {OVERVIEW_CHART_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function Overview() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.overview")}
      loadingSkeleton={<OverviewSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  return (
    <div className="flex h-full w-full grow flex-col gap-2">
      <Suspense fallback={<OverviewHeaderSkeleton />}>
        <OverviewHeaderSection />
      </Suspense>
      <ControlsMenu />
      <Suspense fallback={<OverviewMetricsSkeleton />}>
        <OverviewMetricsSection />
      </Suspense>
    </div>
  );
}

function OverviewHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-[calc(75vh-8rem)] w-full rounded-md" />
    </div>
  );
}

function OverviewHeaderSection() {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <h2 className="max-w-64 truncate text-xl font-semibold">
          {instanceInfo.friendlyName}
        </h2>
        <InstanceStateIndicator state={instanceInfo.state} />
      </div>
      {hasInstancePermission(
        instanceInfo,
        InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
      ) && <TerminalComponent scope={logScope} />}
    </div>
  );
}

function OverviewMetricsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OVERVIEW_SUMMARY_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        {OVERVIEW_CHART_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function OverviewMetricsSection() {
  const { instanceInfoQueryOptions, metricsQueryOptions } =
    Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { data: metricsData } = useSuspenseQuery(metricsQueryOptions);
  const hasMetricsPermission = hasInstancePermission(
    instanceInfo,
    InstancePermission.READ_BOT_INFO,
  );
  const isActiveState =
    instanceInfo.state === InstanceState.RUNNING ||
    instanceInfo.state === InstanceState.STARTING ||
    instanceInfo.state === InstanceState.PAUSED;
  const hasSnapshots = metricsData.snapshots.length >= 2;
  const showMetrics = hasMetricsPermission && (isActiveState || hasSnapshots);

  if (!showMetrics) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <MetricsSummaryCards data={metricsData} />
      {hasSnapshots && (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
            <BotsOnlineChart snapshots={metricsData.snapshots} />
            <NetworkTrafficChart snapshots={metricsData.snapshots} />
            <BandwidthChart snapshots={metricsData.snapshots} />
            <TickDurationChart snapshots={metricsData.snapshots} />
            <HealthFoodChart snapshots={metricsData.snapshots} />
            <ChunksEntitiesChart snapshots={metricsData.snapshots} />
            <ConnectionEventsChart snapshots={metricsData.snapshots} />
          </div>
          {metricsData.distributions && (
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <HealthDistributionChart
                histogram={metricsData.distributions.healthHistogram}
              />
              <DimensionPieChart
                dimensionCounts={metricsData.distributions.dimensionCounts}
              />
              <GameModePieChart
                gameModeCounts={metricsData.distributions.gameModeCounts}
              />
              <PositionScatterChart
                positions={metricsData.distributions.botPositions}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

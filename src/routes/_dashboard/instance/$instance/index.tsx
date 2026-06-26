import { create } from "@bufbuild/protobuf";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SquareTerminalIcon } from "lucide-react";
import { type ReactNode, Suspense, useMemo, useState } from "react";
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
  NetworkTrafficChart,
  PositionScatterChart,
  TickDurationChart,
} from "@/components/instance-metrics/metrics-charts.tsx";
import { InstanceStateIndicator } from "@/components/instance-state-indicator.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Badge } from "@/components/ui/badge.tsx";
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
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { InstancePermission } from "@/generated/soulfire/common_pb.ts";
import { InstanceState } from "@/generated/soulfire/instance_pb.ts";
import {
  InstanceLogScopeSchema,
  type LogScope,
  LogScopeSchema,
} from "@/generated/soulfire/logs_pb.ts";
import type {
  GetInstanceMetricsResponse,
  MetricsSnapshot,
} from "@/generated/soulfire/metrics_pb.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";
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
] as const;

function OverviewSkeleton() {
  return (
    <div className="flex h-full w-full grow flex-col gap-3">
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {OVERVIEW_SUMMARY_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        {OVERVIEW_CHART_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-56 w-full rounded-lg" />
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
        <InstanceStateIndicator state={instanceInfo.state} />
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

function OverviewMetricsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {OVERVIEW_SUMMARY_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        {OVERVIEW_CHART_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-56 w-full rounded-lg" />
        ))}
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
  const isActiveState =
    instanceInfo.state === InstanceState.RUNNING ||
    instanceInfo.state === InstanceState.STARTING ||
    instanceInfo.state === InstanceState.PAUSED;
  const hasSnapshots = metricsData.snapshots.length >= 2;
  const showMetrics = hasMetricsPermission && (isActiveState || hasSnapshots);
  const latest = getLatestSnapshot(metricsData);

  return (
    <div className="flex flex-col gap-3">
      <OverviewSummaryCards instanceInfo={instanceInfo} latest={latest} />
      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <ReadinessCard instanceInfo={instanceInfo} />
        <ActivityCard
          latest={latest}
          hasMetricsPermission={hasMetricsPermission}
        />
      </div>
      {!showMetrics && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">
              {t("overview.metricsUnavailable.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {hasMetricsPermission
              ? t("overview.metricsUnavailable.inactive")
              : t("overview.metricsUnavailable.noPermission")}
          </CardContent>
        </Card>
      )}
      {showMetrics && hasSnapshots && (
        <div className="flex flex-col gap-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            <div className="2xl:col-span-2">
              <BotsOnlineChart snapshots={metricsData.snapshots} />
            </div>
            <NetworkTrafficChart snapshots={metricsData.snapshots} />
            <TickDurationChart snapshots={metricsData.snapshots} />
            <BandwidthChart snapshots={metricsData.snapshots} />
            <HealthFoodChart snapshots={metricsData.snapshots} />
            <ChunksEntitiesChart snapshots={metricsData.snapshots} />
            <ConnectionEventsChart snapshots={metricsData.snapshots} />
          </div>
          {metricsData.distributions && (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
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
        </div>
      )}
    </div>
  );
}

function OverviewSummaryCards({
  instanceInfo,
  latest,
}: {
  instanceInfo: InstanceInfoQueryData;
  latest: MetricsSnapshot | null;
}) {
  const { t } = useTranslation("instance");
  const configuredBotAmount = getConfiguredBotAmount(instanceInfo);
  const totalBots = latest?.botsTotal ?? configuredBotAmount;
  const items = [
    {
      id: "online",
      label: t("metrics.summary.online"),
      value: `${latest?.botsOnline ?? 0}/${totalBots}`,
      detail: t("overview.summary.configured", {
        count: configuredBotAmount,
      }),
    },
    {
      id: "accounts",
      label: t("overview.summary.accounts"),
      value: formatNumber(instanceInfo.profile.accounts.length),
      detail: t("overview.summary.imported"),
    },
    {
      id: "proxies",
      label: t("overview.summary.proxies"),
      value: formatNumber(instanceInfo.profile.proxies.length),
      detail: t("overview.summary.configuredShort"),
    },
    {
      id: "traffic",
      label: t("metrics.summary.traffic"),
      value: latest
        ? formatBytes(latest.bytesSentPerSecond + latest.bytesReceivedPerSecond)
        : "-",
      detail: t("overview.summary.currentRate"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent className="flex flex-col gap-1 py-1">
            <span className="text-muted-foreground text-xs">{item.label}</span>
            <span className="font-mono text-lg leading-none font-semibold">
              {item.value}
            </span>
            <span className="text-muted-foreground text-xs">{item.detail}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReadinessCard({
  instanceInfo,
}: {
  instanceInfo: InstanceInfoQueryData;
}) {
  const { t } = useTranslation("instance");
  const configuredBotAmount = getConfiguredBotAmount(instanceInfo);
  const accountCount = instanceInfo.profile.accounts.length;
  const proxyCount = instanceInfo.profile.proxies.length;
  const pluginPageCount = instanceInfo.instanceSettings.filter(
    (page) => page.owningPluginId !== undefined,
  ).length;

  const rows: ReadinessRowProps[] = [
    {
      id: "accounts",
      label: t("overview.readiness.accounts"),
      value: t("overview.readiness.accountsValue", {
        count: accountCount,
        requested: configuredBotAmount,
      }),
      state: accountCount >= configuredBotAmount ? "ready" : "warning",
      badge:
        accountCount >= configuredBotAmount
          ? t("overview.status.ready")
          : t("overview.status.attention"),
      action: (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/accounts"
              params={{ instance: instanceInfo.id }}
            />
          }
        >
          {t("overview.actions.manage")}
        </Button>
      ),
    },
    {
      id: "proxies",
      label: t("overview.readiness.proxies"),
      value: t("overview.readiness.proxiesValue", { count: proxyCount }),
      state: proxyCount > 0 ? "ready" : "neutral",
      badge:
        proxyCount > 0
          ? t("overview.status.configured")
          : t("overview.status.optional"),
      action: (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/proxies"
              params={{ instance: instanceInfo.id }}
            />
          }
        >
          {t("overview.actions.manage")}
        </Button>
      ),
    },
    {
      id: "plugins",
      label: t("overview.readiness.plugins"),
      value: t("overview.readiness.pluginsValue", { count: pluginPageCount }),
      state: pluginPageCount > 0 ? "ready" : "neutral",
      badge:
        pluginPageCount > 0
          ? t("overview.status.available")
          : t("overview.status.none"),
      action: (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/discover"
              params={{ instance: instanceInfo.id }}
            />
          }
        >
          {t("overview.actions.open")}
        </Button>
      ),
    },
  ];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.readiness.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((row) => (
          <ReadinessRow key={row.id} {...row} />
        ))}
      </CardContent>
    </Card>
  );
}

type ReadinessRowProps = {
  id: string;
  label: string;
  value: string;
  state: "ready" | "warning" | "neutral";
  badge: string;
  action: ReactNode;
};

function ReadinessRow(props: ReadinessRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{props.label}</p>
          <Badge
            variant={
              props.state === "warning"
                ? "destructive"
                : props.state === "ready"
                  ? "secondary"
                  : "outline"
            }
          >
            {props.badge}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">{props.value}</p>
      </div>
      {props.action}
    </div>
  );
}

function ActivityCard({
  latest,
  hasMetricsPermission,
}: {
  latest: MetricsSnapshot | null;
  hasMetricsPermission: boolean;
}) {
  const { t } = useTranslation("instance");
  const rows = latest
    ? [
        {
          id: "tick",
          label: t("overview.activity.tick"),
          value: `${latest.avgTickDurationMs.toFixed(1)}ms`,
        },
        {
          id: "health",
          label: t("overview.activity.health"),
          value: latest.avgHealth.toFixed(1),
        },
        {
          id: "world",
          label: t("overview.activity.world"),
          value: t("overview.activity.worldValue", {
            chunks: formatNumber(latest.totalLoadedChunks),
            entities: formatNumber(latest.totalTrackedEntities),
          }),
        },
        {
          id: "connections",
          label: t("overview.activity.connections"),
          value: t("overview.activity.connectionsValue", {
            connections: latest.connections,
            disconnections: latest.disconnections,
          }),
        },
      ]
    : [
        {
          id: "empty",
          label: t("overview.activity.noDataTitle"),
          value: hasMetricsPermission
            ? t("overview.activity.noDataDescription")
            : t("overview.metricsUnavailable.noPermission"),
        },
      ];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("overview.activity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm">{row.label}</span>
              <span className="text-right font-mono text-sm font-medium">
                {row.value}
              </span>
            </div>
            {index < rows.length - 1 && <Separator />}
          </div>
        ))}
      </CardContent>
    </Card>
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

function getConfiguredBotAmount(instanceInfo: InstanceInfoQueryData): number {
  const amount = instanceInfo.profile.settings.bot?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return 1;
  }

  return Math.max(1, Math.floor(amount));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)} B/s`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB/s`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatNumber(value: number): string {
  if (value < 1000) {
    return value.toFixed(0);
  }

  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return `${(value / 1_000_000).toFixed(1)}M`;
}

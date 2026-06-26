import { create } from "@bufbuild/protobuf";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SquareTerminalIcon } from "lucide-react";
import { type ReactNode, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ControlsMenu from "@/components/controls-menu.tsx";
import { ActivityTimeline } from "@/components/instance-overview/activity-timeline.tsx";
import {
  AutomationSummary,
  PluginStatsPanel,
} from "@/components/instance-overview/automation-summary.tsx";
import {
  BotCardSkeleton,
  BotGridPreview,
} from "@/components/instance-overview/bot-grid.tsx";
import { DetailedMetrics } from "@/components/instance-overview/detailed-metrics.tsx";
import { FleetSpotlight } from "@/components/instance-overview/fleet-spotlight.tsx";
import { KpiStrip } from "@/components/instance-overview/kpi-strip.tsx";
import { LiveFeed } from "@/components/instance-overview/live-feed.tsx";
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
      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {OVERVIEW_KPI_SKELETON_IDS.map((id) => (
          <Skeleton key={id} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function SpotlightSkeleton() {
  return <Skeleton className="h-56 w-full rounded-lg" />;
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

function NoPermissionCard({ message }: { message: string }) {
  return (
    <Card size="sm">
      <CardContent className="text-muted-foreground flex min-h-44 items-center justify-center text-sm">
        {message}
      </CardContent>
    </Card>
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

  const isActiveState =
    instanceInfo.state === InstanceState.RUNNING ||
    instanceInfo.state === InstanceState.STARTING ||
    instanceInfo.state === InstanceState.PAUSED;
  const hasSnapshots = metricsData.snapshots.length >= 2;
  const showMetrics = hasMetricsPermission && (isActiveState || hasSnapshots);
  const latest = getLatestSnapshot(metricsData);

  const configuredBotAmount = getConfiguredBotAmount(instanceInfo);
  const setupIncomplete =
    instanceInfo.profile.accounts.length < configuredBotAmount;

  return (
    <div className="flex flex-col gap-3">
      {setupIncomplete && <ReadinessCard instanceInfo={instanceInfo} />}

      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        {hasMetricsPermission ? (
          <Suspense fallback={<SpotlightSkeleton />}>
            <FleetSpotlight instanceInfo={instanceInfo} />
          </Suspense>
        ) : (
          <NoPermissionCard
            message={t("overview.metricsUnavailable.noPermission")}
          />
        )}
        <LiveFeed
          instanceId={instanceInfo.id}
          canWatch={hasMetricsPermission}
        />
      </div>

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
        <div className="flex flex-col gap-3">
          <AutomationSummary instanceId={instanceInfo.id} />
          <PluginStatsPanel
            instanceId={instanceInfo.id}
            canView={hasMetricsPermission}
          />
        </div>
      </div>

      {showMetrics && hasSnapshots && (
        <DetailedMetrics metricsData={metricsData} />
      )}
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

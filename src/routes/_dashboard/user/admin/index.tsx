import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  AggregateBotsChart,
  CpuUsageChart,
  MemoryUsageChart,
  ServerMetricsTiles,
  ThreadCountChart,
} from "@/components/admin-metrics/server-metrics-charts.tsx";
import {
  StatTile,
  StatTileGrid,
  StatTileSkeleton,
} from "@/components/admin-metrics/stat-tile.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalPermission, UserRole } from "@/generated/soulfire/common_pb";
import { formatNumber } from "@/lib/format.ts";
import { generateN } from "@/lib/generate-n.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasGlobalPermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/admin/")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.overview"), {
      kind: "dynamic",
      name: "chart-area",
    }),
  loader: (props) => {
    const {
      queryClient,
      clientDataQueryOptions,
      usersQueryOptions,
      serverMetricsOptions,
    } = props.context;
    // Users need READ_USER and server metrics need READ_SERVER_CONFIG.
    // Without them the requests always fail.
    void queryClient
      .ensureQueryData(clientDataQueryOptions)
      .then((clientInfo) =>
        Promise.all([
          hasGlobalPermission(clientInfo, GlobalPermission.READ_USER)
            ? queryClient.prefetchQuery(usersQueryOptions)
            : undefined,
          hasGlobalPermission(clientInfo, GlobalPermission.READ_SERVER_CONFIG)
            ? queryClient.prefetchQuery(serverMetricsOptions)
            : undefined,
        ]),
      )
      .catch(() => {
        // The page reads client data itself and shows its error state.
      });
  },
  component: OverviewPage,
});

// Matches the number of tiles a full server metrics snapshot shows.
const METRIC_TILE_COUNT = 5;

function AdminOverviewSkeleton() {
  return (
    <div className="flex size-full grow flex-col gap-4">
      <StatTileGrid>
        {generateN(2 + METRIC_TILE_COUNT).map((slot) => (
          <StatTileSkeleton key={slot} />
        ))}
      </StatTileGrid>
    </div>
  );
}

function OverviewPage() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout
      showUserCrumb={false}
      extraCrumbs={[
        {
          id: "admin",
          content: t("breadcrumbs.admin"),
        },
      ]}
      pageName={t("pageName.overview")}
      loadingSkeleton={<AdminOverviewSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("admin");
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  // Each section needs its own permission. Without it the request fails and
  // would take the rest of the overview down with it.
  const canReadUsers = hasGlobalPermission(
    clientInfo,
    GlobalPermission.READ_USER,
  );
  const canReadMetrics = hasGlobalPermission(
    clientInfo,
    GlobalPermission.READ_SERVER_CONFIG,
  );

  return (
    <div className="flex size-full grow flex-col gap-4">
      <StatTileGrid>
        {canReadUsers && (
          <Suspense fallback={<StatTileSkeleton />}>
            <UsersTile />
          </Suspense>
        )}
        <Suspense fallback={<StatTileSkeleton />}>
          <ProjectsTile />
        </Suspense>
        {canReadMetrics && (
          <Suspense
            fallback={generateN(METRIC_TILE_COUNT).map((slot) => (
              <StatTileSkeleton key={slot} />
            ))}
          >
            <MetricTiles />
          </Suspense>
        )}
      </StatTileGrid>
      {canReadMetrics && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">
            {t("overview.serverMetrics.sectionTitle")}
          </h3>
          <Suspense fallback={<MetricChartsSkeleton />}>
            <MetricCharts />
          </Suspense>
        </section>
      )}
    </div>
  );
}

function UsersTile() {
  const { t } = useTranslation("admin");
  const { usersQueryOptions } = Route.useRouteContext();
  const { data: userList } = useSuspenseQuery(usersQueryOptions);
  const total = userList.users.length;
  const admins = userList.users.filter(
    (user) => user.role === UserRole.ADMIN,
  ).length;

  return (
    <StatTile
      label={t("overview.stats.users")}
      value={formatNumber(total)}
      detail={
        admins > 0 && admins < total
          ? t("overview.stats.admins", { count: admins })
          : undefined
      }
    />
  );
}

function ProjectsTile() {
  const { t } = useTranslation("admin");
  const { instanceListQueryOptions } = Route.useRouteContext();
  const { data: instanceList } = useSuspenseQuery(instanceListQueryOptions);
  const total = instanceList.instances.length;
  const active = instanceList.instances.filter(
    (instance) => (instance.botSummary?.desiredBots ?? 0) > 0,
  ).length;

  return (
    <StatTile
      label={t("overview.stats.projects")}
      value={formatNumber(total)}
      detail={
        active > 0 && active < total
          ? t("overview.stats.active", { count: active })
          : undefined
      }
    />
  );
}

function MetricTiles() {
  const { serverMetricsOptions } = Route.useRouteContext();
  const { data: serverMetrics } = useSuspenseQuery(serverMetricsOptions);
  const latest = serverMetrics.snapshots.at(-1);
  return latest ? <ServerMetricsTiles latest={latest} /> : null;
}

function MetricChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {generateN(4).map((slot) => (
        <Skeleton key={slot} className="h-64 w-full rounded-lg" />
      ))}
    </div>
  );
}

function MetricCharts() {
  const { t } = useTranslation("admin");
  const { serverMetricsOptions } = Route.useRouteContext();
  const { data: serverMetrics } = useSuspenseQuery(serverMetricsOptions);

  // A line needs two samples. The server records one every three seconds.
  if (serverMetrics.snapshots.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("overview.serverMetrics.collecting")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <CpuUsageChart snapshots={serverMetrics.snapshots} />
      <MemoryUsageChart snapshots={serverMetrics.snapshots} />
      <ThreadCountChart snapshots={serverMetrics.snapshots} />
      <AggregateBotsChart snapshots={serverMetrics.snapshots} />
    </div>
  );
}

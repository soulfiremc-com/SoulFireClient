import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Suspense, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Label, Pie, PieChart } from "recharts";
import {
  AggregateBotsChart,
  CpuUsageChart,
  MemoryUsageChart,
  ServerMetricsSummaryCards,
  ThreadCountChart,
} from "@/components/admin-metrics/server-metrics-charts.tsx";
import { ChartBreakdown } from "@/components/chart-breakdown.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type CustomTooltipProps,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalPermission, UserRole } from "@/generated/soulfire/common_pb";
import type { InstanceListResponse } from "@/generated/soulfire/instance_pb";
import type { UserListResponse } from "@/generated/soulfire/user_pb";
import { formatNumber } from "@/lib/format.ts";
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
    const { queryClient, clientDataQueryOptions, usersQueryOptions } =
      props.context;
    // The users chart needs READ_USER. Without it the request always fails.
    void queryClient
      .ensureQueryData(clientDataQueryOptions)
      .then((clientInfo) =>
        hasGlobalPermission(clientInfo, GlobalPermission.READ_USER)
          ? queryClient.prefetchQuery(usersQueryOptions)
          : undefined,
      )
      .catch(() => {
        // The page reads client data itself and shows its error state.
      });
    void props.context.queryClient.prefetchQuery(
      props.context.serverMetricsOptions,
    );
  },
  component: OverviewPage,
});

const usersChartConfig = {
  users: {
    label: <Trans i18nKey="admin:overview.usersChart.label.role" />,
  },
  user: {
    label: <Trans i18nKey="admin:overview.usersChart.label.user" />,
    color: "var(--chart-2)",
  },
  admin: {
    label: <Trans i18nKey="admin:overview.usersChart.label.admin" />,
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function forType(userList: UserListResponse, type: UserRole) {
  return userList.users.filter((user) => user.role === type).length;
}

function UsersChart(props: { userList: UserListResponse }) {
  const { t } = useTranslation("admin");
  const adminCount = forType(props.userList, UserRole.ADMIN);
  const userCount = forType(props.userList, UserRole.USER);
  const chartData = useMemo(
    () => [
      {
        userRole: "admin",
        users: adminCount,
        fill: "var(--color-admin)",
      },
      {
        userRole: "user",
        users: userCount,
        fill: "var(--color-user)",
      },
    ],
    [adminCount, userCount],
  );

  const totalUsers = React.useMemo(
    () => chartData.reduce((acc, curr) => acc + curr.users, 0),
    [chartData],
  );

  return (
    <Card className="flex flex-col border-0">
      <CardHeader className="items-center">
        <CardTitle>{t("overview.usersChart.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer
          config={usersChartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart title={t("overview.usersChart.title")}>
            <ChartTooltip
              cursor={false}
              content={(tooltipProps: CustomTooltipProps) => (
                <ChartTooltipContent {...tooltipProps} hideLabel />
              )}
            />
            <Pie
              data={chartData}
              dataKey="users"
              nameKey="userRole"
              innerRadius={60}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {formatNumber(totalUsers)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          {t("overview.usersChart.users")}
                        </tspan>
                      </text>
                    );
                  }
                  return undefined;
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ChartBreakdown
          className="pt-2"
          items={[
            {
              id: "admin",
              label: t("overview.usersChart.label.admin"),
              value: adminCount,
              swatchClassName: "bg-chart-1",
            },
            {
              id: "user",
              label: t("overview.usersChart.label.user"),
              value: userCount,
              swatchClassName: "bg-chart-2",
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

const instancesChartConfig = {
  instances: {
    label: <Trans i18nKey="admin:overview.instancesChart.label.state" />,
  },
  active: {
    label: <Trans i18nKey="admin:overview.instancesChart.label.active" />,
    color: "var(--chart-2)",
  },
  stopped: {
    label: <Trans i18nKey="admin:overview.instancesChart.label.stopped" />,
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function InstancesChart(props: { instanceList: InstanceListResponse }) {
  const { t } = useTranslation("admin");
  const activeCount = props.instanceList.instances.filter(
    (instance) => (instance.botSummary?.desiredBots ?? 0) > 0,
  ).length;
  const stoppedCount = props.instanceList.instances.length - activeCount;
  const chartData = useMemo(
    () => [
      {
        instanceState: "active",
        instances: activeCount,
        fill: "var(--color-active)",
      },
      {
        instanceState: "stopped",
        instances: stoppedCount,
        fill: "var(--color-stopped)",
      },
    ],
    [activeCount, stoppedCount],
  );

  const totalInstances = React.useMemo(
    () => chartData.reduce((acc, curr) => acc + curr.instances, 0),
    [chartData],
  );

  return (
    <Card className="flex flex-col border-0">
      <CardHeader className="items-center pb-0">
        <CardTitle>{t("overview.instancesChart.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={instancesChartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart title={t("overview.instancesChart.title")}>
            <ChartTooltip
              cursor={false}
              content={(tooltipProps: CustomTooltipProps) => (
                <ChartTooltipContent {...tooltipProps} hideLabel />
              )}
            />
            <Pie
              data={chartData}
              dataKey="instances"
              nameKey="instanceState"
              innerRadius={60}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {formatNumber(totalInstances)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          {t("overview.instancesChart.instances")}
                        </tspan>
                      </text>
                    );
                  }
                  return undefined;
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ChartBreakdown
          className="pt-2"
          items={[
            {
              id: "active",
              label: t("overview.instancesChart.label.active"),
              value: activeCount,
              swatchClassName: "bg-chart-2",
            },
            {
              id: "stopped",
              label: t("overview.instancesChart.label.stopped"),
              value: stoppedCount,
              swatchClassName: "bg-chart-1",
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function AdminOverviewSkeleton() {
  return (
    <div className="flex size-full grow flex-col gap-2 pl-2">
      <Skeleton className="h-7 w-48" />
      <AdminChartsSkeleton />
      <Skeleton className="mt-4 h-7 w-48" />
      <AdminMetricsSkeleton />
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
  const { t } = useTranslation("common");
  return (
    <div className="flex size-full grow flex-col gap-2 pl-2">
      <Suspense fallback={<Skeleton className="h-7 w-48" />}>
        <AdminWelcomeHeading />
      </Suspense>
      <Suspense fallback={<AdminChartsSkeleton />}>
        <AdminChartsSection />
      </Suspense>
      <h3 className="mt-4 text-lg font-semibold">
        {t("admin:overview.serverMetrics.sectionTitle")}
      </h3>
      <Suspense fallback={<AdminMetricsSkeleton />}>
        <AdminMetricsSection />
      </Suspense>
    </div>
  );
}

function AdminWelcomeHeading() {
  const { t } = useTranslation("common");
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);

  return (
    <h2 className="text-xl font-semibold">
      {t("admin:overview.welcome", {
        name: clientInfo.username,
      })}
    </h2>
  );
}

function AdminChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function AdminChartsSection() {
  const { clientDataQueryOptions, instanceListQueryOptions } =
    Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const { data: instanceList } = useSuspenseQuery(instanceListQueryOptions);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Listing users needs its own permission. Without it the request fails
          and would take the rest of the overview down with it. */}
      {hasGlobalPermission(clientInfo, GlobalPermission.READ_USER) && (
        <UsersChartSection />
      )}
      <InstancesChart instanceList={instanceList} />
    </div>
  );
}

function UsersChartSection() {
  const { usersQueryOptions } = Route.useRouteContext();
  const { data: userList } = useSuspenseQuery(usersQueryOptions);
  return <UsersChart userList={userList} />;
}

function AdminMetricsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </>
  );
}

function AdminMetricsSection() {
  const { serverMetricsOptions } = Route.useRouteContext();
  const { data: serverMetrics } = useSuspenseQuery(serverMetricsOptions);

  return (
    <>
      <ServerMetricsSummaryCards data={serverMetrics} />
      {serverMetrics.snapshots.length >= 2 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CpuUsageChart snapshots={serverMetrics.snapshots} />
          <MemoryUsageChart snapshots={serverMetrics.snapshots} />
          <ThreadCountChart snapshots={serverMetrics.snapshots} />
          <AggregateBotsChart snapshots={serverMetrics.snapshots} />
        </div>
      )}
    </>
  );
}

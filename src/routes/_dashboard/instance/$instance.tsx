import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { type ComponentProps, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ErrorComponent } from "@/components/error-component.tsx";
import { NavigationFeedback } from "@/components/nav/navigation-feedback.tsx";
import { InstanceSidebar } from "@/components/nav/instance/instance-sidebar.tsx";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { useBotStatusStream } from "@/hooks/use-bot-status-stream.ts";
import { useStoredSidebarOpen } from "@/hooks/use-stored-sidebar-open.ts";
import { instanceInfoQueryOptions as instanceInfoQueryOptionsFor } from "@/lib/instance-info-query.ts";
import { instanceMetricsQueryOptions } from "@/lib/metrics-query.ts";
import { isResourceUnavailable } from "@/lib/resource-errors";
import { createTransport } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/instance/$instance")({
  beforeLoad: (props) => {
    const { instance } = props.params;
    const transport = createTransport();
    const instanceInfoQueryOptions = instanceInfoQueryOptionsFor(
      transport,
      instance,
    );
    const metricsQueryOptions = instanceMetricsQueryOptions(
      transport,
      instance,
    );
    return {
      instanceInfoQueryOptions,
      metricsQueryOptions,
    };
  },
  loader: (props) => {
    void props.context.queryClient.prefetchQuery(
      props.context.instanceInfoQueryOptions,
    );
  },
  component: InstanceLayout,
  errorComponent: InstanceErrorComponent,
});

/** Access can come back, so the unavailable screen keeps checking slowly. */
const UNAVAILABLE_RECHECK_MS = 15_000;

function UnavailableInstance({
  onAvailable,
}: {
  onAvailable?: (() => void) | undefined;
}) {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { isSuccess, isFetching, refetch } = useQuery({
    ...instanceInfoQueryOptions,
    refetchInterval: UNAVAILABLE_RECHECK_MS,
  });
  // The layout recovers through its own observer. The error boundary needs a reset.
  useEffect(() => {
    if (isSuccess) onAvailable?.();
  }, [isSuccess, onAvailable]);

  return (
    <main className="flex flex-1 p-4">
      <Empty className="m-auto max-w-md bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("instanceUnavailable.title")}</EmptyTitle>
          <EmptyDescription>
            {t("instanceUnavailable.description")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/user" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            {t("instanceSidebar.backToDashboard")}
          </Button>
          <Button
            variant="ghost"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            <RefreshCwIcon
              data-icon="inline-start"
              className={isFetching ? "motion-safe:animate-spin" : undefined}
            />
            {t("instanceUnavailable.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

function InstanceErrorComponent(props: ComponentProps<typeof ErrorComponent>) {
  return isResourceUnavailable(props.error) ? (
    <UnavailableInstance onAvailable={props.reset} />
  ) : (
    <ErrorComponent {...props} />
  );
}

function InstanceLayout() {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  // Observe errors without adding another polling timer or suspending the layout.
  const { error } = useQuery({
    ...instanceInfoQueryOptions,
    refetchInterval: false,
  });
  if (isResourceUnavailable(error)) return <UnavailableInstance />;
  return <InstanceLayoutContent />;
}

function InstanceLayoutContent() {
  useBotStatusStream(Route.useParams().instance);
  const sidebar = useStoredSidebarOpen();

  return (
    <SidebarProvider
      open={sidebar.open}
      onOpenChange={sidebar.setOpen}
      className="min-h-0 flex-1"
    >
      <InstanceSidebar />
      <TooltipProvider delay={500}>
        <SidebarInset className="min-w-0">
          <NavigationFeedback />
          <Outlet />
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}

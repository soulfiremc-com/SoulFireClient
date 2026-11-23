import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ComponentProps } from "react";
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
import {
  demoInstancePermissions,
  demoInstancePlugins,
  demoInstanceSettings,
  demoInstanceSettingsDefinitions,
} from "@/demo-data.ts";
import { BotFleetSummarySchema } from "@/generated/soulfire/bot_pb";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProto_OfflineJavaDataSchema,
  ProxyProto_Type,
  ProxyProtoSchema,
} from "@/generated/soulfire/common_pb";
import {
  type InstanceConfig,
  InstanceConfigSchema,
  InstanceInfoSchema,
} from "@/generated/soulfire/instance_pb";
import { useBotStatusStream } from "@/hooks/use-bot-status-stream.ts";
import { useStoredSidebarOpen } from "@/hooks/use-stored-sidebar-open.ts";
import { fetchInstanceInfo } from "@/lib/instance-info-query.ts";
import { instanceMetricsQueryOptions } from "@/lib/metrics-query.ts";
import { isResourceUnavailable } from "@/lib/resource-errors";
import {
  convertFromInstanceProto,
  type InstanceInfoQueryData,
} from "@/lib/types.ts";
import { createTransport } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/instance/$instance")({
  beforeLoad: (props) => {
    const { instance } = props.params;
    const instanceInfoQueryOptions = queryOptions({
      queryKey: ["instance-info", instance],
      queryFn: async (context): Promise<InstanceInfoQueryData> => {
        const transport = createTransport();
        if (transport === null) {
          const instanceConfig: InstanceConfig = create(InstanceConfigSchema, {
            settings: [],
            accounts: [
              {
                type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
                profileId: "607d30e7-115b-3838-914a-e4229c2b985d",
                lastKnownName: "Pistonmaster",
                accountData: {
                  case: "offlineJavaData",
                  value: create(
                    MinecraftAccountProto_OfflineJavaDataSchema,
                    {},
                  ),
                },
                config: [],
                persistentMetadata: [],
              },
            ],
            proxies: [
              create(ProxyProtoSchema, {
                type: ProxyProto_Type.HTTP,
                address: "127.0.0.1:8080",
                username: "admin",
                password: "admin",
              }),
              create(ProxyProtoSchema, {
                type: ProxyProto_Type.SOCKS4,
                address: "127.0.0.1:8081",
                username: "admin",
              }),
              create(ProxyProtoSchema, {
                type: ProxyProto_Type.SOCKS5,
                address: "127.0.0.1:8082",
                username: "admin",
                password: "admin",
              }),
            ],
            persistentMetadata: [],
          });
          const instanceInfo = create(InstanceInfoSchema, {
            friendlyName: "Demo",
            icon: "pickaxe",
            instancePermissions: demoInstancePermissions,
            config: instanceConfig,
            settingsDefinitions: demoInstanceSettingsDefinitions,
            instanceSettings: demoInstanceSettings,
            plugins: demoInstancePlugins,
            botSummary: create(BotFleetSummarySchema, {
              totalBots: 1,
              desiredBots: 1,
              onlineBots: 1,
            }),
            lastModified: create(TimestampSchema, {
              seconds: 0n,
              nanos: 0,
            }),
          });
          return {
            id: instance,
            profile: convertFromInstanceProto(instanceConfig),
            ...instanceInfo,
          };
        }

        return fetchInstanceInfo(
          transport,
          instance,
          context.client,
          context.signal,
        );
      },
      refetchInterval: 3000,
    });
    const transport = createTransport();
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

function UnavailableInstance() {
  const { t } = useTranslation("common");
  return (
    <main className="flex flex-1 p-4">
      <Empty className="m-auto max-w-md bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("instanceUnavailable.title")}</EmptyTitle>
          <EmptyDescription>
            {t("instanceUnavailable.description")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/user" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            {t("instanceSidebar.backToDashboard")}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

function InstanceErrorComponent(props: ComponentProps<typeof ErrorComponent>) {
  return isResourceUnavailable(props.error) ? (
    <UnavailableInstance />
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

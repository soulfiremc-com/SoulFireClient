import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { CatchBoundary, createFileRoute, Outlet } from "@tanstack/react-router";
import { ErrorComponent } from "@/components/error-component.tsx";
import { InstanceSidebar } from "@/components/nav/instance/instance-sidebar.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import {
  demoInstanceSettings,
  demoInstanceSettingsDefinitions,
} from "@/demo-data.ts";
import { TimestampSchema } from "@/generated/google/protobuf/timestamp_pb.ts";
import { BotFleetSummarySchema } from "@/generated/soulfire/bot_pb.ts";
import {
  InstancePermission,
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProto_OfflineJavaDataSchema,
  ProxyProto_Type,
  ProxyProtoSchema,
} from "@/generated/soulfire/common_pb.ts";
import {
  type InstanceConfig,
  InstanceConfigSchema,
  InstanceInfoSchema,
  InstancePermissionStateSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb.ts";
import { useBotStatusStream } from "@/hooks/use-bot-status-stream.ts";
import { useCastBroadcast } from "@/hooks/use-cast-broadcast.ts";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import i18n from "@/lib/i18n";
import { instanceMetricsQueryOptions } from "@/lib/metrics-query.ts";
import { routeChrome } from "@/lib/route-title.ts";
import {
  convertFromInstanceProto,
  type InstanceInfoQueryData,
} from "@/lib/types.ts";
import { smartEntries } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/instance/$instance")({
  beforeLoad: (props) => {
    const { instance } = props.params;
    const instanceInfoQueryOptions = queryOptions({
      queryKey: ["instance-info", instance],
      queryFn: async (props): Promise<InstanceInfoQueryData> => {
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
            instancePermissions: smartEntries(InstancePermission).map(
              (permission) =>
                create(InstancePermissionStateSchema, {
                  instancePermission: permission[1],
                  granted: true,
                }),
            ),
            config: instanceConfig,
            settingsDefinitions: demoInstanceSettingsDefinitions,
            instanceSettings: demoInstanceSettings,
            plugins: [],
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

        // Get previous cached data to use for if-modified-since check
        const previousData = props.client.getQueryData<InstanceInfoQueryData>([
          "instance-info",
          instance,
        ]);

        const instanceService = createClient(InstanceService, transport);
        const result = await instanceService.getInstanceInfo(
          {
            id: instance,
            ifModifiedSince: previousData?.lastModified,
          },
          {
            signal: props.signal,
          },
        );

        if (result.result.case === "notModified") {
          // Return previous data if not modified
          if (previousData) {
            return previousData;
          }
          throw new Error("No cached data available");
        }

        if (result.result.case !== "info") {
          throw new Error("Unexpected response type");
        }

        const info = result.result.value;
        return {
          id: instance,
          profile: convertFromInstanceProto(info.config),
          ...info,
        };
      },
      refetchInterval: 3_000,
    });
    const transport = createTransport();
    const metricsQueryOptions = instanceMetricsQueryOptions(
      transport,
      instance,
      props.context.queryClient,
    );
    props.abortController.signal.addEventListener("abort", () => {
      void props.context.queryClient.cancelQueries({
        queryKey: instanceInfoQueryOptions.queryKey,
      });
    });
    return {
      instanceInfoQueryOptions,
      metricsQueryOptions,
      ...routeChrome({
        getTitle: (match) => {
          const titleContext = match.context as {
            queryClient: QueryClient;
          };
          const instanceInfo =
            titleContext.queryClient.getQueryData<InstanceInfoQueryData>(
              instanceInfoQueryOptions.queryKey,
            );
          return (
            instanceInfo?.friendlyName ?? i18n.t("common:pageName.overview")
          );
        },
        getIcon: (match) => {
          const iconContext = match.context as {
            queryClient: QueryClient;
          };
          const instanceInfo =
            iconContext.queryClient.getQueryData<InstanceInfoQueryData>(
              instanceInfoQueryOptions.queryKey,
            );
          return instanceInfo?.icon
            ? { kind: "dynamic", name: instanceInfo.icon }
            : null;
        },
      }),
    };
  },
  loader: (props) => {
    void props.context.queryClient.prefetchQuery(
      props.context.instanceInfoQueryOptions,
    );
  },
  component: InstanceLayout,
});

function InstanceLayout() {
  const { metricsQueryOptions, instanceInfoQueryOptions } =
    Route.useRouteContext();
  useCastBroadcast(
    metricsQueryOptions.queryKey,
    instanceInfoQueryOptions.queryKey,
  );
  useBotStatusStream(Route.useParams().instance);
  const isMobile = useIsMobile();
  const sidebarState = localStorage.getItem("sidebar:state");
  const defaultOpen =
    sidebarState === null ? !isMobile : sidebarState === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="min-h-0 flex-1">
      <InstanceSidebar />
      <TooltipProvider delay={500}>
        <SidebarInset>
          <CatchBoundary
            getResetKey={() => "instance-layout"}
            errorComponent={ErrorComponent}
          >
            <Outlet />
          </CatchBoundary>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}

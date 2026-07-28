import { create } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { BotFleetSummarySchema } from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import type { ClientDataResponse } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import { ClientService } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import { InstancePermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  type InstanceListResponse,
  InstanceListResponseSchema,
  InstancePermissionStateSchema,
  InstanceService,
} from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CreateInstanceProvider } from "@/components/dialog/create-instance-dialog.tsx";
import { ErrorComponent } from "@/components/error-component.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { demoClientData } from "@/demo-data.ts";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import { smartEntries } from "@/lib/utils.tsx";
import {
  createTransport,
  isAuthenticated,
  isImpersonating,
  logOut,
} from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: async (props) => {
    if (isAuthenticated()) {
      const instanceListQueryOptions = queryOptions({
        queryKey: ["instance-list"],
        queryFn: async (props): Promise<InstanceListResponse> => {
          const transport = createTransport();
          if (transport === null) {
            return create(InstanceListResponseSchema, {
              instances: [
                {
                  id: "demo",
                  friendlyName: "Demo",
                  icon: "pickaxe",
                  botSummary: create(BotFleetSummarySchema, {
                    totalBots: 1,
                    desiredBots: 1,
                    onlineBots: 1,
                  }),
                  instancePermissions: smartEntries(InstancePermission).map(
                    (permission) =>
                      create(InstancePermissionStateSchema, {
                        instancePermission: permission[1],
                        granted: true,
                      }),
                  ),
                },
              ],
            });
          }

          const instanceService = createClient(InstanceService, transport);
          const result = await instanceService.listInstances(
            {},
            {
              signal: props.signal,
            },
          );

          return result;
        },
        refetchInterval: 3_000,
      });
      props.abortController.signal.addEventListener("abort", () => {
        void props.context.queryClient.cancelQueries({
          queryKey: instanceListQueryOptions.queryKey,
        });
      });
      const clientDataQueryOptions = queryOptions({
        queryKey: ["client-data"],
        queryFn: async (props): Promise<ClientDataResponse> => {
          const transport = createTransport();
          if (transport === null) {
            return demoClientData;
          }

          const clientService = createClient(ClientService, transport);
          const result = await clientService.getClientData(
            {},
            {
              signal: props.signal,
            },
          );

          // console.log(JSON.stringify(result))
          return result;
        },
      });
      props.abortController.signal.addEventListener("abort", () => {
        void props.context.queryClient.cancelQueries({
          queryKey: clientDataQueryOptions.queryKey,
        });
      });
      return {
        instanceListQueryOptions,
        clientDataQueryOptions,
      };
    } else {
      if (isDesktopApp()) {
        await desktop.integratedServer.kill();
      }
      logOut();
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/",
        search: {
          redirect: props.location.href,
        },
      });
    }
  },
  loader: (
    props,
  ):
    | {
        success: true;
        transport: Transport | null;
      }
    | {
        success: false;
        connectionError: object;
      } => {
    const transport = createTransport();
    if (transport === null) {
      return {
        success: true,
        transport,
      };
    }

    try {
      void props.context.queryClient.prefetchQuery(
        props.context.instanceListQueryOptions,
      );
      void props.context.queryClient.prefetchQuery(
        props.context.clientDataQueryOptions,
      );

      // We need this as demo data
      // if (APP_ENVIRONMENT === 'development') {
      //   console.debug(JSON.stringify(configResult.response));
      // }

      return {
        success: true,
        transport,
      };
    } catch (e) {
      return {
        success: false,
        connectionError: e as object,
      };
    }
  },
  component: DashboardLayout,
  // Ensure we show the pending component when needed
  wrapInSuspense: true,
});

function InstanceSwitchKeybinds() {
  const navigate = useNavigate();
  const { instanceListQueryOptions } = Route.useRouteContext();
  const { data: instanceList } = useSuspenseQuery(instanceListQueryOptions);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const numberKey = parseInt(e.key, 10);
        if (numberKey > 0 && numberKey <= instanceList.instances.length) {
          e.preventDefault();
          void navigate({
            to: "/instance/$instance",
            params: { instance: instanceList.instances[numberKey - 1].id },
          });
        }
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [instanceList.instances, navigate]);

  return null;
}

function DashboardLayout() {
  const { t } = useTranslation("common");
  const loaderData = Route.useLoaderData();
  if (!loaderData.success) {
    return <ErrorComponent error={new Error(t("error.connectionFailed"))} />;
  }

  return (
    <TransportContext value={loaderData.transport}>
      <Suspense>
        <InstanceSwitchKeybinds />
      </Suspense>
      {isImpersonating() && (
        <div className="border-sidebar-primary pointer-events-none absolute top-0 right-0 bottom-0 left-0 z-30 overflow-hidden border-4" />
      )}
      <CreateInstanceProvider>
        <Outlet />
      </CreateInstanceProvider>
    </TransportContext>
  );
}

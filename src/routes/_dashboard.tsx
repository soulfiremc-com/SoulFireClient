import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";
import { Suspense, use, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CommandPaletteProvider } from "@/components/command-palette";
import { CreateInstanceProvider } from "@/components/dialog/create-instance-dialog.tsx";
import { ErrorComponent } from "@/components/error-component.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { demoClientData, demoInstancePermissions } from "@/demo-data.ts";
import { BotFleetSummarySchema } from "@/generated/soulfire/bot_pb";
import type { ClientDataResponse } from "@/generated/soulfire/client_pb";
import { ClientService } from "@/generated/soulfire/client_pb";
import { useProductActivation } from "@/hooks/use-product-activation";
import {
  type InstanceListResponse,
  InstanceListResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { hasOpenDialog, projectShortcutIndex } from "@/lib/keyboard-shortcuts";
import { desktop, isDesktopApp, isMac } from "@/lib/desktop.ts";
import {
  getAnalyticsIdentity,
  syncAnalyticsIdentity,
} from "@/lib/analytics-identity";
import { analyticsConsent, isPostHogConfigured } from "@/lib/posthog.ts";
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import { useSupportReminderUsage } from "@/hooks/use-support-reminder-usage";
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
        queryFn: async (context): Promise<InstanceListResponse> => {
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
                  instancePermissions: demoInstancePermissions,
                },
              ],
            });
          }

          const instanceService = createRpcClient(InstanceService, transport);
          const result = await Effect.runPromise(
            instanceService.listInstances(
              {},
              {
                signal: context.signal,
              },
            ),
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
        queryFn: async (context): Promise<ClientDataResponse> => {
          const transport = createTransport();
          if (transport === null) {
            return demoClientData;
          }

          const clientService = createRpcClient(ClientService, transport);
          const result = await Effect.runPromise(
            clientService.getClientData(
              {},
              {
                signal: context.signal,
              },
            ),
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
    }
    if (isDesktopApp()) {
      await desktop.integratedServer.kill();
    }
    logOut();
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router handles a thrown redirect
    throw redirect({
      to: "/",
      search: {
        redirect: props.location.href,
      },
    });
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
        connectionError: e instanceof Error ? e : new Error(String(e)),
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
    const down = (event: KeyboardEvent) => {
      // Keep keys inside open dialogs and the bot view's captured input.
      if (
        event.defaultPrevented ||
        document.pointerLockElement ||
        hasOpenDialog(document)
      )
        return;
      const index = projectShortcutIndex(event, isMac);
      const instance =
        index === null ? undefined : instanceList.instances[index];
      if (!instance) return;
      event.preventDefault();
      void navigate({
        to: "/instance/$instance",
        params: { instance: instance.id },
      });
    };
    document.addEventListener("keydown", down);
    return () => {
      document.removeEventListener("keydown", down);
    };
  }, [instanceList.instances, navigate]);

  return null;
}

function ClientSession() {
  const posthog = usePostHog();
  const consent = useAnalyticsConsent();
  const transport = use(TransportContext);
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const installationId = clientInfo.serverInfo?.installationId;
  const identity =
    transport && !isImpersonating()
      ? getAnalyticsIdentity(installationId, clientInfo.id)
      : null;

  useEffect(() => {
    if (!isPostHogConfigured || consent !== "granted") return;

    syncAnalyticsIdentity(
      posthog,
      identity,
      {
        email: clientInfo.email,
        role: clientInfo.role,
        username: clientInfo.username,
        installation_id: installationId ?? "",
        analytics_identity_version: 2,
      },
      () => {
        analyticsConsent.resetIdentity(true);
      },
    );
  }, [
    clientInfo.email,
    clientInfo.role,
    clientInfo.username,
    identity,
    installationId,
    posthog,
    consent,
  ]);

  useProductActivation(identity ?? "", identity !== null);
  useSupportReminderUsage(clientInfo.id, !isImpersonating());

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
        <ClientSession />
        {/* Browsers use Ctrl+1 to 9 to switch tabs, so only the desktop app takes them. */}
        {isDesktopApp() && <InstanceSwitchKeybinds />}
      </Suspense>
      {isImpersonating() && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden border-4 border-sidebar-primary" />
      )}
      <CreateInstanceProvider>
        <CommandPaletteProvider>
          <Outlet />
        </CommandPaletteProvider>
      </CreateInstanceProvider>
    </TransportContext>
  );
}

import { createClient } from "@connectrpc/connect";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { use } from "react";
import { useTranslation } from "react-i18next";
import { SdkQuickstart } from "@/components/developer/sdk-quickstart.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { ClientService } from "@/generated/soulfire/client_pb";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { sdkServerUrl } from "@/lib/sdk-quickstart.ts";
import { hasGlobalPermission, hasInstancePermission } from "@/lib/utils.tsx";
import { getServerAddress, getServerType } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/instance/$instance/sdk")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:sdk.title"), {
      kind: "dynamic",
      name: "code-xml",
    }),
  component: SdkPage,
});

function SdkPage() {
  const { t } = useTranslation("common");
  return (
    <InstancePageLayout
      pageName={t("sdk.title")}
      documentationLink="https://soulfiremc.com/docs/sdk"
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { instanceInfoQueryOptions, clientDataQueryOptions } =
    Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  const { data: statuses } = useQuery({
    ...botStatusQueryOptions(instanceInfo.id),
    enabled: hasInstancePermission(
      instanceInfo,
      InstancePermission.READ_BOT_INFO,
    ),
  });
  const onlineById = new Map(
    statuses?.bots.map((bot) => [bot.profileId, bot.isOnline]),
  );
  const demo = transport === null;
  const serverUrl = demo
    ? null
    : (sdkServerUrl(getServerAddress()) ??
      sdkServerUrl(clientInfo.serverInfo?.publicApiAddress));

  return (
    <SdkQuickstart
      key={`${instanceInfo.id}:${serverUrl}`}
      serverUrl={serverUrl}
      instanceId={instanceInfo.id}
      instanceName={instanceInfo.friendlyName}
      bots={instanceInfo.profile.accounts.map((account) => ({
        id: account.profileId,
        name: account.lastKnownName,
        online: onlineById.get(account.profileId),
      }))}
      demo={demo}
      integrated={!demo && getServerType() === "integrated"}
      generateToken={
        !demo &&
        hasGlobalPermission(clientInfo, GlobalPermission.GENERATE_API_TOKEN)
          ? async (signal) =>
              (
                await createClient(ClientService, transport).generateAPIToken(
                  {},
                  { signal },
                )
              ).token
          : undefined
      }
      onOpenAccounts={() =>
        void navigate({
          to: "/instance/$instance/accounts",
          params: { instance: instanceInfo.id },
        })
      }
      onOpenBots={() =>
        void navigate({
          to: "/instance/$instance/bots",
          params: { instance: instanceInfo.id },
        })
      }
    />
  );
}

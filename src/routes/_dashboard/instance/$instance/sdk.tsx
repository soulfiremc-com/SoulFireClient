import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { use } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenTextIcon } from "lucide-react";
import { SdkQuickstart } from "@/components/developer/sdk-quickstart.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import { Button } from "@/components/ui/button.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { ClientService } from "@/generated/soulfire/client_pb";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import { botDisplayName } from "@/lib/bot-with-status.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { sdkServerUrl } from "@/lib/sdk-quickstart.ts";
import { hasGlobalPermission, hasInstancePermission } from "@/lib/utils.tsx";
import {
  getServerAddress,
  getServerType,
  isImpersonating,
} from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/instance/$instance/sdk")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:sdk.title"), {
      kind: "dynamic",
      name: "code-xml",
    }),
  component: SdkPage,
});

const SDK_DOCS_URL = "https://soulfiremc.com/docs/sdk";

function SdkPage() {
  const { t } = useTranslation("common");
  return (
    <InstancePageLayout
      pageName={t("sdk.title")}
      pageDescription={t("sdk.description")}
      pageActions={
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<ExternalLink href={SDK_DOCS_URL} />}
        >
          <BookOpenTextIcon data-icon="inline-start" />
          {t("sdk.docs")}
        </Button>
      }
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const {
    instanceInfoQueryOptions,
    clientDataQueryOptions,
    instanceListQueryOptions,
  } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const { data: instanceList } = useQuery(instanceListQueryOptions);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  const { data: statuses } = useQuery({
    ...botStatusQueryOptions(instanceInfo.id),
    enabled: hasInstancePermission(
      instanceInfo,
      InstancePermission.READ_BOT_INFO,
    ),
  });
  const statusById = new Map(statuses?.bots.map((bot) => [bot.profileId, bot]));
  const demo = transport === null;
  const impersonating = !demo && isImpersonating();
  const serverUrl = demo
    ? null
    : (sdkServerUrl(getServerAddress()) ??
      sdkServerUrl(clientInfo.serverInfo?.publicApiAddress));

  return (
    <SdkQuickstart
      key={`${serverUrl}:${impersonating}`}
      serverUrl={serverUrl}
      instanceId={instanceInfo.id}
      instanceName={instanceInfo.friendlyName}
      instances={instanceList?.instances.map((instance) => ({
        id: instance.id,
        name: instance.friendlyName,
      }))}
      onInstanceChange={(instance) =>
        void navigate({
          to: "/instance/$instance/sdk",
          params: { instance },
        })
      }
      bots={instanceInfo.profile.accounts.map((account) => {
        const entry = statusById.get(account.profileId);
        return {
          id: account.profileId,
          name: botDisplayName(account, entry),
          online: entry?.isOnline,
        };
      })}
      demo={demo}
      impersonating={impersonating}
      integrated={!demo && getServerType() === "integrated"}
      generateToken={
        !demo &&
        !impersonating &&
        hasGlobalPermission(clientInfo, GlobalPermission.GENERATE_API_TOKEN)
          ? async (signal) =>
              (
                await Effect.runPromise(
                  createRpcClient(ClientService, transport).generateAPIToken(
                    {},
                    { signal },
                  ),
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

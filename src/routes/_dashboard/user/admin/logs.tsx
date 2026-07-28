import { create } from "@bufbuild/protobuf";
import { GlobalPermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  GlobalLogScopeSchema,
  type LogScope,
  LogScopeSchema,
} from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import UserPageLayout from "@/components/nav/user/user-page-layout";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasGlobalPermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/admin/logs")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.logs"), {
      kind: "dynamic",
      name: "logs",
    }),
  component: Logs,
});

function LogsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-[calc(75vh-8rem)] w-full rounded-md" />
    </div>
  );
}

function Logs() {
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
      pageName={t("pageName.logs")}
      loadingSkeleton={<LogsSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientData } = useSuspenseQuery(clientDataQueryOptions);
  const logScope = useMemo<LogScope>(
    () =>
      create(LogScopeSchema, {
        scope: {
          case: "global",
          value: create(GlobalLogScopeSchema, {}),
        },
      }),
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      {hasGlobalPermission(
        clientData,
        GlobalPermission.GLOBAL_SUBSCRIBE_LOGS,
      ) && <TerminalComponent scope={logScope} />}
    </div>
  );
}

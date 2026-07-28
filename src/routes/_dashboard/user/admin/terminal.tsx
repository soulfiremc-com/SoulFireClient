import { create } from "@bufbuild/protobuf";
import {
  type CommandScope,
  CommandScopeSchema,
  GlobalCommandScopeSchema,
} from "@soulfiremc/sdk/generated/soulfire/command_pb";
import { GlobalPermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  type LogScope,
  LogScopeSchema,
  PersonalLogScopeSchema,
} from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import CommandInput from "@/components/command-input.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasGlobalPermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/admin/terminal")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.terminal"), {
      kind: "dynamic",
      name: "square-terminal",
    }),
  component: Terminal,
});

function TerminalSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-[calc(75vh-8rem)] w-full rounded-md" />
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}

function Terminal() {
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
      pageName={t("pageName.terminal")}
      loadingSkeleton={<TerminalSkeleton />}
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
          case: "personal",
          value: create(PersonalLogScopeSchema, {}),
        },
      }),
    [],
  );
  const commandScope = useMemo<CommandScope>(
    () =>
      create(CommandScopeSchema, {
        scope: {
          case: "global",
          value: create(GlobalCommandScopeSchema, {}),
        },
      }),
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      <TerminalComponent scope={logScope} />
      {hasGlobalPermission(
        clientData,
        GlobalPermission.GLOBAL_COMMAND_EXECUTION,
      ) && <CommandInput scope={commandScope} />}
    </div>
  );
}

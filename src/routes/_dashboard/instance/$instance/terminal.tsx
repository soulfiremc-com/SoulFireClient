import { create } from "@bufbuild/protobuf";
import {
  type CommandScope,
  CommandScopeSchema,
  InstanceCommandScopeSchema,
} from "@soulfiremc/sdk/generated/soulfire/command_pb";
import { InstancePermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
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
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasInstancePermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/instance/$instance/terminal")(
  {
    beforeLoad: () =>
      staticRouteChrome(() => i18n.t("common:pageName.terminal"), {
        kind: "dynamic",
        name: "square-terminal",
      }),
    component: Terminal,
  },
);

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
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.terminal")}
      loadingSkeleton={<TerminalSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
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
          case: "instance",
          value: create(InstanceCommandScopeSchema, {
            instanceId: instanceInfo.id,
          }),
        },
      }),
    [instanceInfo.id],
  );

  return (
    <div className="flex flex-col gap-2">
      <TerminalComponent scope={logScope} />
      {hasInstancePermission(
        instanceInfo,
        InstancePermission.INSTANCE_COMMAND_EXECUTION,
      ) && <CommandInput scope={commandScope} />}
    </div>
  );
}

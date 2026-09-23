import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BlocksIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InstancePluginInfoCard } from "@/components/instance-plugin-info-card.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";

export const Route = createFileRoute("/_dashboard/instance/$instance/discover")(
  {
    beforeLoad: () =>
      staticRouteChrome(() => i18n.t("common:pageName.discoverPlugins"), {
        kind: "dynamic",
        name: "blocks",
      }),
    component: Discover,
  },
);

function PluginCardSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div className="grid h-full w-full grow grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <PluginCardSkeleton key={i} />
      ))}
    </div>
  );
}

function Discover() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "extensions",
          content: t("breadcrumbs.extensions"),
        },
      ]}
      pageName={t("pageName.discoverPlugins")}
      loadingSkeleton={<DiscoverSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const plugins = instanceInfo.instanceSettings.filter(
    (settings) =>
      settings.owningPluginId !== undefined &&
      settings.enabledIdentifier !== undefined,
  );

  if (plugins.length === 0) {
    return (
      <Empty className="h-full rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BlocksIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle>
            {t("discover.noPluginsTitle", {
              defaultValue: "No discoverable plugins found",
            })}
          </EmptyTitle>
          <EmptyDescription>
            {t("discover.noPluginsDescription", {
              defaultValue:
                "This instance does not expose any plugin settings yet.",
            })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid h-full w-full grow grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plugins.map((settings) => {
        const plugin = instanceInfo.plugins.find(
          (p) => p.id === settings.owningPluginId,
        );
        if (!plugin) return null;
        return (
          <InstancePluginInfoCard
            key={settings.id}
            settingsEntry={settings}
            plugin={plugin}
          />
        );
      })}
    </div>
  );
}

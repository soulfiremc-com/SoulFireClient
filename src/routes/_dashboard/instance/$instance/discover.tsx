import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BlocksIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type {
  ServerPlugin,
  SettingsPage,
} from "@/generated/soulfire/common_pb";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import {
  classifyPluginTask,
  PLUGIN_TASKS,
  type PluginTask,
} from "@/lib/settings-discovery.ts";
import { getSettingValue } from "@/lib/utils.tsx";

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

function PluginGrid(props: {
  entries: { settings: SettingsPage; plugin: ServerPlugin }[];
}) {
  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {props.entries.map(({ settings, plugin }) => (
        <InstancePluginInfoCard
          key={settings.id}
          settingsEntry={settings}
          plugin={plugin}
        />
      ))}
    </div>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const [query, setQuery] = useState("");
  const [task, setTask] = useState<PluginTask | "all">("all");

  const plugins = useMemo(
    () =>
      instanceInfo.instanceSettings.flatMap((settings) => {
        if (
          settings.owningPluginId === undefined ||
          settings.enabledIdentifier === undefined
        ) {
          return [];
        }
        const plugin = instanceInfo.plugins.find(
          (p) => p.id === settings.owningPluginId,
        );
        if (!plugin) return [];
        const text = `${settings.pageName} ${plugin.id} ${plugin.description}`;
        const enabledId = settings.enabledIdentifier;
        const enabledDefinition = instanceInfo.settingsDefinitions.find(
          (d) =>
            d.id?.namespace === enabledId.namespace &&
            d.id.key === enabledId.key,
        );
        return [
          {
            settings,
            plugin,
            text: text.toLowerCase(),
            task: classifyPluginTask(text),
            enabled:
              getSettingValue(instanceInfo.profile, enabledDefinition) === true,
          },
        ];
      }),
    [
      instanceInfo.instanceSettings,
      instanceInfo.plugins,
      instanceInfo.profile,
      instanceInfo.settingsDefinitions,
    ],
  );

  if (plugins.length === 0) {
    return (
      <Empty className="h-full rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BlocksIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle>{t("discover.noPluginsTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("discover.noPluginsDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const usedTasks = PLUGIN_TASKS.filter((id) =>
    plugins.some((plugin) => plugin.task === id),
  );
  const needle = query.trim().toLowerCase();
  const visible = plugins.filter(
    (plugin) =>
      (task === "all" || plugin.task === task) &&
      (needle === "" || plugin.text.includes(needle)),
  );
  const enabled = visible.filter((plugin) => plugin.enabled);
  const available = visible.filter((plugin) => !plugin.enabled);

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-muted-foreground max-w-2xl text-sm">
        {t("discover.scope")}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={t("discover.search")}
            placeholder={t("discover.search")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </InputGroup>
        <ToggleGroup
          aria-label={t("discover.filterLabel")}
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={[task]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) setTask(next as PluginTask | "all");
          }}
        >
          <ToggleGroupItem value="all">
            {t("discover.tasks.all")}
          </ToggleGroupItem>
          {usedTasks.map((id) => (
            <ToggleGroupItem key={id} value={id}>
              {t(`discover.tasks.${id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {visible.length === 0 && (
        <p className="text-muted-foreground text-sm" role="status">
          {t("discover.noMatches")}
        </p>
      )}
      {enabled.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">
            {t("discover.enabledHeading")}
          </h3>
          <PluginGrid entries={enabled} />
        </section>
      )}
      {available.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">
            {t("discover.availableHeading")}
          </h3>
          <PluginGrid entries={available} />
        </section>
      )}
    </div>
  );
}

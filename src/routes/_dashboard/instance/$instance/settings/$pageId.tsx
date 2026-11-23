import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { InstancePluginInfoCard } from "@/components/instance-plugin-info-card.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { NotFoundComponent } from "@/components/not-found-component.tsx";
import { InstanceSettingsPageComponent } from "@/components/settings-page.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { settingsPageName } from "@/lib/page-names.ts";
import { loaderDataString, routeChrome } from "@/lib/route-title.ts";
import { parseSettingFocusSearch } from "@/lib/settings-focus";

function getSettingsPageFallbackIcon(pageId: string | undefined) {
  switch (pageId) {
    case "bot": {
      return "bot";
    }
    case "account": {
      return "users";
    }
    case "proxy": {
      return "waypoints";
    }
    case "ai": {
      return "sparkles";
    }
    case "pathfinding": {
      return "route";
    }
    case undefined:
    default: {
      return "settings-2";
    }
  }
}

export const Route = createFileRoute(
  "/_dashboard/instance/$instance/settings/$pageId",
)({
  validateSearch: parseSettingFocusSearch,
  beforeLoad: () =>
    routeChrome({
      // Translate when the title is read: translations may not be loaded yet
      // while the loader runs.
      getTitle: (match) => {
        const title = loaderDataString(match, "title")?.trim();
        if (!title) return i18n.t("common:breadcrumbs.settings");
        return settingsPageName(
          {
            id: match.params["pageId"] ?? "",
            pageName: title,
            owningPluginId: loaderDataString(match, "pluginId"),
          },
          (key) => i18n.t(key),
        );
      },
      getIcon: (match) => {
        const iconName = loaderDataString(match, "iconName");
        return {
          kind: "dynamic" as const,
          name: iconName ?? getSettingsPageFallbackIcon(match.params["pageId"]),
        };
      },
    }),
  loader: async (props) => {
    const instanceInfo = await props.context.queryClient.ensureQueryData(
      props.context.instanceInfoQueryOptions,
    );
    const settingsEntry = instanceInfo.instanceSettings.find(
      (setting) => setting.id === props.params.pageId,
    );

    return settingsEntry
      ? {
          title: settingsEntry.pageName,
          pluginId: settingsEntry.owningPluginId ?? null,
          iconName:
            settingsEntry.iconId ||
            getSettingsPageFallbackIcon(props.params.pageId),
        }
      : {
          title: null,
          iconName: getSettingsPageFallbackIcon(props.params.pageId),
        };
  },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Content />
    </Suspense>
  );
}

const SKELETON_FIELD_IDS = [
  "field-1",
  "field-2",
  "field-3",
  "field-4",
  "field-5",
] as const;

function SettingsFormSkeleton() {
  return (
    <div className="flex size-full grow flex-row gap-2">
      <div className="flex h-full grow flex-col gap-4">
        <div className="flex flex-col gap-2">
          {SKELETON_FIELD_IDS.map((id) => (
            <div key={id} className="flex flex-col gap-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "loading",
          content: <Skeleton className="h-4 w-24" />,
        },
      ]}
      pageName={<Skeleton className="h-4 w-24" />}
      loadingSkeleton={<SettingsFormSkeleton />}
    >
      {null}
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const { pageId } = Route.useParams();
  const { focusNamespace, focusKey } = Route.useSearch();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const settingsEntry = instanceInfo.instanceSettings.find(
    (s) => s.id === pageId,
  );
  if (!settingsEntry) {
    return <NotFoundComponent />;
  }

  const plugin = settingsEntry.owningPluginId
    ? instanceInfo.plugins.find((p) => p.id === settingsEntry.owningPluginId)
    : undefined;

  return (
    <InstancePageLayout
      extraCrumbs={[
        plugin
          ? {
              id: "extensions",
              content: t("breadcrumbs.extensions"),
            }
          : {
              id: "settings",
              content: t("breadcrumbs.settings"),
            },
      ]}
      pageName={settingsPageName(settingsEntry, t)}
    >
      <div className="flex w-full flex-col gap-5">
        {plugin && (
          <InstancePluginInfoCard
            settingsEntry={settingsEntry}
            plugin={plugin}
          />
        )}
        <InstanceSettingsPageComponent
          data={settingsEntry}
          focusSetting={
            focusNamespace && focusKey
              ? { namespace: focusNamespace, key: focusKey }
              : undefined
          }
        />
      </div>
    </InstancePageLayout>
  );
}

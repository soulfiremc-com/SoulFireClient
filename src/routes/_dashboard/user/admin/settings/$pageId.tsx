import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { ServerPluginInfoCard } from "@/components/instance-plugin-info-card.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout";
import { NotFoundComponent } from "@/components/not-found-component.tsx";
import { AdminSettingsPageComponent } from "@/components/settings-page.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { settingsPageName } from "@/lib/page-names.ts";
import { loaderDataString, routeChrome } from "@/lib/route-title.ts";
import { parseSettingFocusSearch } from "@/lib/settings-focus";

export const Route = createFileRoute("/_dashboard/user/admin/settings/$pageId")(
  {
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
            name: iconName ?? "settings-2",
          };
        },
      }),
    loader: async (props) => {
      const serverInfo = await props.context.queryClient.ensureQueryData(
        props.context.serverInfoQueryOptions,
      );
      const settingsEntry = serverInfo.serverSettings.find(
        (setting) => setting.id === props.params.pageId,
      );
      const fallbackIconName =
        props.params.pageId === "server"
          ? "server"
          : props.params.pageId === "dev"
            ? "bug"
            : "settings-2";

      return settingsEntry
        ? {
            title: settingsEntry.pageName,
            pluginId: settingsEntry.owningPluginId ?? null,
            iconName: settingsEntry.iconId || fallbackIconName,
          }
        : {
            title: null,
            iconName: fallbackIconName,
          };
    },
    component: SettingsPage,
  },
);

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
    <div className="flex size-full grow flex-row gap-2 pl-2">
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
  const { t } = useTranslation("common");

  return (
    <UserPageLayout
      showUserCrumb={false}
      extraCrumbs={[
        {
          id: "admin",
          content: t("breadcrumbs.admin"),
        },
        {
          id: "settings",
          content: t("breadcrumbs.settings"),
        },
      ]}
      pageName={<Skeleton className="h-4 w-24" />}
      loadingSkeleton={<SettingsFormSkeleton />}
    >
      {null}
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const { pageId } = Route.useParams();
  const { focusNamespace, focusKey } = Route.useSearch();
  const { serverInfoQueryOptions } = Route.useRouteContext();
  const { data: serverInfo } = useSuspenseQuery(serverInfoQueryOptions);
  const settingsEntry = serverInfo.serverSettings.find((s) => s.id === pageId);
  if (!settingsEntry) {
    return <NotFoundComponent />;
  }

  const plugin = settingsEntry.owningPluginId
    ? serverInfo.plugins.find((p) => p.id === settingsEntry.owningPluginId)
    : undefined;

  return (
    <UserPageLayout
      showUserCrumb={false}
      extraCrumbs={[
        {
          id: "admin",
          content: t("breadcrumbs.admin"),
        },
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
          <ServerPluginInfoCard settingsEntry={settingsEntry} plugin={plugin} />
        )}
        <AdminSettingsPageComponent
          data={settingsEntry}
          focusSetting={
            focusNamespace && focusKey
              ? { namespace: focusNamespace, key: focusKey }
              : undefined
          }
        />
      </div>
    </UserPageLayout>
  );
}

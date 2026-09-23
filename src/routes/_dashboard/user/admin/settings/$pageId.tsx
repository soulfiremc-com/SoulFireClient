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
import { routeChrome } from "@/lib/route-title.ts";

export const Route = createFileRoute("/_dashboard/user/admin/settings/$pageId")(
  {
    beforeLoad: () =>
      routeChrome({
        getTitle: (match) => {
          const loaderData = match.loaderData as
            | {
                title?: null | string;
              }
            | undefined;
          return (
            loaderData?.title?.trim() || i18n.t("common:breadcrumbs.settings")
          );
        },
        getIcon: (match) => {
          const loaderData = match.loaderData as
            | {
                iconName?: null | string;
              }
            | undefined;
          return {
            kind: "dynamic" as const,
            name: loaderData?.iconName ?? "settings-2",
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
            iconName: settingsEntry.iconId ?? fallbackIconName,
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

function SettingsFormSkeleton() {
  return (
    <div className="flex h-full w-full grow flex-row gap-2 pl-2">
      <div className="flex h-full grow flex-col gap-4">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
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
      pageName={settingsEntry.pageName}
    >
      <div className="flex h-full w-full grow flex-row gap-2 pl-2">
        <div className="flex h-full grow flex-col gap-4">
          {plugin && (
            <ServerPluginInfoCard
              settingsEntry={settingsEntry}
              plugin={plugin}
            />
          )}
          <div className="flex flex-col gap-2">
            <AdminSettingsPageComponent data={settingsEntry} />
          </div>
        </div>
      </div>
    </UserPageLayout>
  );
}

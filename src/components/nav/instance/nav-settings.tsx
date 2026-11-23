import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, type LinkProps, useRouteContext } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { hasInstancePermission } from "@/lib/utils.tsx";

interface NavLink {
  id: string;
  title: string;
  iconId: string;
  linkProps: LinkProps;
}

// Pages with their own sidebar entry or their own route.
const KNOWN_SETTING_PAGE_IDS = new Set([
  "bot",
  "account",
  "proxy",
  "ai",
  "pathfinding",
]);

export function NavSettings() {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  const pageIconMap = useMemo(
    () =>
      new Map(
        instanceInfo.instanceSettings.map((page) => [page.id, page.iconId]),
      ),
    [instanceInfo.instanceSettings],
  );

  const navLinks: NavLink[] = [
    {
      id: "settings:bot",
      title: t("instanceSidebar.botSettings"),
      iconId: pageIconMap.get("bot") ?? "bot",
      linkProps: {
        to: "/instance/$instance/settings/$pageId",
        params: { instance: instanceInfo.id, pageId: "bot" },
      },
    },
    {
      id: "settings:ai",
      title: t("instanceSidebar.aiSettings"),
      iconId: pageIconMap.get("ai") ?? "sparkles",
      linkProps: {
        to: "/instance/$instance/settings/$pageId",
        params: { instance: instanceInfo.id, pageId: "ai" },
      },
    },
    {
      id: "settings:pathfinding",
      title: t("instanceSidebar.pathfindingSettings"),
      iconId: pageIconMap.get("pathfinding") ?? "route",
      linkProps: {
        to: "/instance/$instance/settings/$pageId",
        params: { instance: instanceInfo.id, pageId: "pathfinding" },
      },
    },
    ...(hasInstancePermission(
      instanceInfo,
      InstancePermission.UPDATE_INSTANCE_META,
    )
      ? [
          {
            id: "meta",
            title: t("instanceSidebar.metaSettings"),
            iconId: "bolt",
            linkProps: {
              to: "/instance/$instance/meta",
              params: { instance: instanceInfo.id },
            },
          } satisfies NavLink,
        ]
      : []),
    ...instanceInfo.instanceSettings
      .filter(
        (page) =>
          page.owningPluginId === undefined &&
          !KNOWN_SETTING_PAGE_IDS.has(page.id),
      )
      .map(
        (page) =>
          ({
            id: `settings:${page.id}`,
            title: page.pageName,
            iconId: page.iconId,
            linkProps: {
              to: "/instance/$instance/settings/$pageId" as const,
              params: { instance: instanceInfo.id, pageId: page.id },
            },
          }) satisfies NavLink,
      ),
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {t("instanceSidebar.settingsGroup")}
      </SidebarGroupLabel>
      <SidebarMenu>
        {navLinks.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              tooltip={item.title}
              render={
                <Link
                  activeOptions={{ exact: true, includeSearch: false }}
                  activeProps={{
                    "data-active": true,
                  }}
                  {...item.linkProps}
                />
              }
            >
              <DynamicIcon name={item.iconId} className="size-4" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

import { InstancePermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
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
import { hasInstancePermission } from "@/lib/utils.tsx";

type NavLink = {
  title: string;
  iconId: string;
  linkProps: LinkProps;
};

export function NavSettings() {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  // Create a lookup map for page icons from server settings
  const pageIconMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of instanceInfo.instanceSettings) {
      map.set(page.id, page.iconId);
    }
    return map;
  }, [instanceInfo.instanceSettings]);

  const builtinPageMap = useMemo(() => {
    const map = new Map(
      instanceInfo.instanceSettings.map((page) => [page.id, page]),
    );
    return map;
  }, [instanceInfo.instanceSettings]);

  const knownSettingPageIds = useMemo(
    () => new Set(["bot", "account", "proxy", "ai", "pathfinding"]),
    [],
  );

  const navLinks: NavLink[] = [
    {
      title: t("instanceSidebar.botSettings"),
      iconId: pageIconMap.get("bot") ?? "bot",
      linkProps: {
        to: "/instance/$instance/settings/$pageId",
        params: { instance: instanceInfo.id, pageId: "bot" },
      },
    },
    {
      title: t("instanceSidebar.accountSettings"),
      iconId: pageIconMap.get("account") ?? "users",
      linkProps: {
        to: "/instance/$instance/accounts",
        params: { instance: instanceInfo.id },
      },
    },
    {
      title: t("instanceSidebar.proxySettings"),
      iconId: pageIconMap.get("proxy") ?? "waypoints",
      linkProps: {
        to: "/instance/$instance/proxies",
        params: { instance: instanceInfo.id },
      },
    },
    {
      title: t("instanceSidebar.aiSettings"),
      iconId: pageIconMap.get("ai") ?? "sparkles",
      linkProps: {
        to: "/instance/$instance/settings/$pageId",
        params: { instance: instanceInfo.id, pageId: "ai" },
      },
    },
    {
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
          !knownSettingPageIds.has(page.id) &&
          page.id !== "account" &&
          page.id !== "proxy",
      )
      .map(
        (page) =>
          ({
            title: page.pageName,
            iconId: builtinPageMap.get(page.id)?.iconId ?? "settings-2",
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
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              render={
                <Link
                  activeOptions={{ exact: true }}
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

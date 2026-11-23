"use client";

import {
  Link,
  type LinkProps,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import {
  HouseIcon,
  IdCardIcon,
  SquareTerminalIcon,
  TextSearchIcon,
  UsersIcon,
  WaypointsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";

type NavLinks = {
  title: string;
  icon: (props: { className: string }) => ReactNode;
  linkProps: LinkProps;
  /** A detail page that belongs to this link, such as one bot of the list. */
  detailRouteId?: string;
}[];

export function NavControls() {
  const { t } = useTranslation("common");
  const instance = useParams({
    from: "/_dashboard/instance/$instance",
    select: (params) => params.instance,
  });
  const routeIds = useRouterState({
    select: (state) => state.matches.map((match) => match.routeId as string),
  });

  const navLinks: NavLinks = [
    {
      title: t("instanceSidebar.overview"),
      icon: HouseIcon,
      linkProps: {
        to: "/instance/$instance",
        params: { instance },
      },
    },
    {
      title: t("instanceSidebar.terminal"),
      icon: SquareTerminalIcon,
      linkProps: {
        to: "/instance/$instance/terminal",
        params: { instance },
      },
    },
    {
      title: t("instanceSidebar.bots"),
      icon: UsersIcon,
      linkProps: {
        to: "/instance/$instance/bots",
        params: { instance },
      },
      detailRouteId: "/_dashboard/instance/$instance/bot/$botId",
    },
    {
      title: t("instanceSidebar.accountSettings"),
      icon: IdCardIcon,
      linkProps: {
        to: "/instance/$instance/accounts",
        params: { instance },
      },
    },
    {
      title: t("instanceSidebar.proxySettings"),
      icon: WaypointsIcon,
      linkProps: {
        to: "/instance/$instance/proxies",
        params: { instance },
      },
    },
    {
      title: t("instanceSidebar.audit-log"),
      icon: TextSearchIcon,
      linkProps: {
        to: "/instance/$instance/audit-log",
        params: { instance },
      },
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {t("instanceSidebar.controlsGroup")}
      </SidebarGroupLabel>
      <SidebarMenu>
        {navLinks.map((item) => (
          <SidebarMenuItem key={item.linkProps.to}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={
                item.detailRouteId
                  ? routeIds.includes(item.detailRouteId)
                  : false
              }
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
              <item.icon className="size-4" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

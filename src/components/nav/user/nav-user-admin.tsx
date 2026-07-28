"use client";

import { GlobalPermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, type LinkProps, useRouteContext } from "@tanstack/react-router";
import {
  BugIcon,
  ChartAreaIcon,
  LogsIcon,
  ServerIcon,
  SquareTerminalIcon,
  UsersIcon,
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
import { hasGlobalPermission } from "@/lib/utils.tsx";

type NavLinks = {
  title: string;
  icon: (props: { className: string }) => ReactNode;
  linkProps: LinkProps;
}[];

export function NavUserAdmin() {
  const { t } = useTranslation("common");
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);

  if (!hasGlobalPermission(clientInfo, GlobalPermission.READ_SERVER_CONFIG)) {
    return null;
  }

  const navLinks: NavLinks = [
    {
      title: t("userSidebar.adminOverview"),
      icon: ChartAreaIcon,
      linkProps: {
        to: "/user/admin",
        params: {},
      },
    },
    {
      title: t("userSidebar.adminLogs"),
      icon: LogsIcon,
      linkProps: {
        to: "/user/admin/logs",
        params: {},
      },
    },
    {
      title: t("userSidebar.adminTerminal"),
      icon: SquareTerminalIcon,
      linkProps: {
        to: "/user/admin/terminal",
        params: {},
      },
    },
    {
      title: t("userSidebar.users"),
      icon: UsersIcon,
      linkProps: {
        to: "/user/admin/users",
        params: {},
      },
    },
    {
      title: t("userSidebar.serverSettings"),
      icon: ServerIcon,
      linkProps: {
        to: "/user/admin/settings/$pageId",
        params: { pageId: "server" },
      },
    },
    {
      title: t("userSidebar.devSettings"),
      icon: BugIcon,
      linkProps: {
        to: "/user/admin/settings/$pageId",
        params: { pageId: "dev" },
      },
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("userSidebar.adminGroup")}</SidebarGroupLabel>
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
              <item.icon className="size-4" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

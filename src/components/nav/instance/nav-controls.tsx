"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, type LinkProps, useRouteContext } from "@tanstack/react-router";
import {
  HouseIcon,
  SquareTerminalIcon,
  TextSearchIcon,
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

type NavLinks = {
  title: string;
  icon: (props: { className: string }) => ReactNode;
  linkProps: LinkProps;
}[];

export function NavControls() {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  const navLinks: NavLinks = [
    {
      title: t("instanceSidebar.overview"),
      icon: HouseIcon,
      linkProps: {
        to: "/instance/$instance",
        params: { instance: instanceInfo.id },
      },
    },
    {
      title: t("instanceSidebar.terminal"),
      icon: SquareTerminalIcon,
      linkProps: {
        to: "/instance/$instance/terminal",
        params: { instance: instanceInfo.id },
      },
    },
    {
      title: t("instanceSidebar.bots"),
      icon: UsersIcon,
      linkProps: {
        to: "/instance/$instance/bots",
        params: { instance: instanceInfo.id },
      },
    },
    {
      title: t("instanceSidebar.audit-log"),
      icon: TextSearchIcon,
      linkProps: {
        to: "/instance/$instance/audit-log",
        params: { instance: instanceInfo.id },
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

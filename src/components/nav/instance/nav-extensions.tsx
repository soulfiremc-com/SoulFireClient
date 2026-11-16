import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  type LinkProps,
  useParams,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";
import {
  BlocksIcon,
  ChevronRightIcon,
  CodeXmlIcon,
  ScrollTextIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import {
  createSettingsRegistry,
  type SettingsRegistry,
} from "@/components/providers/settings-registry-context.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { getSettingValue } from "@/lib/utils.tsx";

type NavLinks = {
  title: string;
  icon: (props: { className: string }) => ReactNode;
  linkProps: LinkProps;
  pluginList?: boolean;
  /** A detail page that belongs to this link, such as one script of the list. */
  detailRouteId?: string;
}[];

export function NavExtensions() {
  const { t } = useTranslation("common");
  const sidebar = useSidebar();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const pageId = useParams({
    from: "/_dashboard/instance/$instance/settings/$pageId",
    select: (params) => params.pageId,
    shouldThrow: false,
  });
  const settingsEntry = instanceInfo.instanceSettings.find(
    (s) => s.id === pageId,
  );
  const [pluginCollapsibleOpen, setPluginCollapsibleOpen] = useState(
    settingsEntry !== undefined && settingsEntry.owningPluginId !== undefined,
  );
  const pluginPageId = settingsEntry?.owningPluginId
    ? settingsEntry.id
    : undefined;
  const routeIds = useRouterState({
    select: (state) => state.matches.map((match) => match.routeId as string),
  });
  useEffect(() => {
    if (pluginPageId !== undefined) setPluginCollapsibleOpen(true);
  }, [pluginPageId]);

  const navLinks: NavLinks = [
    {
      title: t("instanceSidebar.discoverPlugins"),
      icon: BlocksIcon,
      linkProps: {
        to: "/instance/$instance/discover",
        params: { instance: instanceInfo.id },
      },
      pluginList: true,
    },
    {
      title: t("instanceSidebar.instanceScripts"),
      icon: ScrollTextIcon,
      linkProps: {
        to: "/instance/$instance/scripts",
        params: { instance: instanceInfo.id },
      },
      detailRouteId: "/_dashboard/instance/$instance/script/$scriptId",
    },
    {
      title: t("sdk.title"),
      icon: CodeXmlIcon,
      linkProps: {
        to: "/instance/$instance/sdk",
        params: { instance: instanceInfo.id },
      },
    },
  ];

  // Create a registry to look up settings definitions
  const settingsRegistry: SettingsRegistry = createSettingsRegistry(
    instanceInfo.settingsDefinitions,
  );

  const pluginSettingLinks: NavLinks = instanceInfo.instanceSettings
    .filter(
      (setting) =>
        setting.owningPluginId !== undefined &&
        setting.enabledIdentifier !== undefined,
    )
    .filter((setting) => {
      const enabledDefinition = settingsRegistry.getDefinition(
        setting.enabledIdentifier,
      );
      return getSettingValue(profile, enabledDefinition) === true;
    })
    .map((setting) => ({
      title: setting.pageName,
      icon: (props) => <DynamicIcon {...props} name={setting.iconId} />,
      linkProps: {
        to: "/instance/$instance/settings/$pageId",
        params: {
          instance: instanceInfo.id,
          pageId: setting.id,
        },
      },
    }));

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {t("instanceSidebar.extensionsGroup")}
      </SidebarGroupLabel>
      <SidebarMenu>
        {navLinks.map((item) =>
          item.pluginList ? (
            <Collapsible
              open={pluginCollapsibleOpen}
              onOpenChange={setPluginCollapsibleOpen}
              render={<SidebarMenuItem className="group/collapsible" />}
              key={item.title}
            >
              <SidebarMenuButton
                tooltip={item.title}
                // The icon rail hides plugin pages, so mark their parent instead.
                isActive={
                  pluginPageId !== undefined &&
                  !sidebar.isMobile &&
                  sidebar.state === "collapsed"
                }
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
              <CollapsibleTrigger
                onClick={(e) => {
                  // When sidebar closed, open sidebar and make sure collapsible is expanded
                  if (!sidebar.isMobile && !sidebar.open) {
                    e.preventDefault();
                    sidebar.setOpen(true);
                    if (!pluginCollapsibleOpen) {
                      setPluginCollapsibleOpen(true);
                    }
                  }
                }}
                render={
                  <SidebarMenuAction className="data-[state=open]:rotate-90" />
                }
              >
                <ChevronRightIcon />
                <span className="sr-only">
                  {t("instanceSidebar.togglePluginSettings")}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {pluginSettingLinks.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton
                        render={
                          <Link
                            activeOptions={{ exact: true }}
                            activeProps={{
                              "data-active": true,
                            }}
                            {...subItem.linkProps}
                          />
                        }
                      >
                        <subItem.icon className="size-4" />
                        <span>{subItem.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={
                  item.detailRouteId !== undefined &&
                  routeIds.includes(item.detailRouteId)
                }
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
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

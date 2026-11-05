import type * as React from "react";
import { Suspense } from "react";
import { InstanceSwitcher } from "@/components/nav/instance/instance-switcher.tsx";
import { NavControls } from "@/components/nav/instance/nav-controls.tsx";
import { NavExtensions } from "@/components/nav/instance/nav-extensions.tsx";
import { NavSettings } from "@/components/nav/instance/nav-settings.tsx";
import { NavAccount } from "@/components/nav/nav-account.tsx";
import { NavDefaultSkeleton } from "@/components/nav/nav-default-skeleton.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar.tsx";

export function InstanceSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="icon"
      className="top-(--titlebar-height) h-[calc(100svh-var(--titlebar-height))]"
      {...props}
    >
      <SidebarHeader className="h-16">
        <InstanceSwitcher />
      </SidebarHeader>
      <ScrollArea className="min-h-0 flex-1 w-full pr-2">
        <SidebarContent className="min-h-full">
          <Suspense fallback={<NavDefaultSkeleton />}>
            <NavControls />
            <NavSettings />
            <NavExtensions />
          </Suspense>
        </SidebarContent>
      </ScrollArea>
      <SidebarFooter className="h-16 justify-center">
        <NavAccount />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

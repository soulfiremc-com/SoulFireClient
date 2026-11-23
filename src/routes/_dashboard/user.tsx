import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NavigationFeedback } from "@/components/nav/navigation-feedback.tsx";
import { UserSidebar } from "@/components/nav/user/user-sidebar.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { useStoredSidebarOpen } from "@/hooks/use-stored-sidebar-open.ts";

export const Route = createFileRoute("/_dashboard/user")({
  component: UserLayout,
});

function UserLayout() {
  const sidebar = useStoredSidebarOpen();

  return (
    <SidebarProvider
      open={sidebar.open}
      onOpenChange={sidebar.setOpen}
      className="min-h-0 flex-1"
    >
      <UserSidebar />
      <TooltipProvider delay={500}>
        <SidebarInset className="min-w-0">
          <NavigationFeedback />
          <Outlet />
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}

import { CatchBoundary, createFileRoute, Outlet } from "@tanstack/react-router";
import { ErrorComponent } from "@/components/error-component.tsx";
import { NavigationFeedback } from "@/components/nav/navigation-feedback.tsx";
import { UserSidebar } from "@/components/nav/user/user-sidebar.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";

export const Route = createFileRoute("/_dashboard/user")({
  component: UserLayout,
});

function UserLayout() {
  const isMobile = useIsMobile();
  const sidebarState = localStorage.getItem("sidebar:state");
  const defaultOpen =
    sidebarState === null ? !isMobile : sidebarState === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="min-h-0 flex-1">
      <UserSidebar />
      <TooltipProvider delay={500}>
        <SidebarInset>
          <NavigationFeedback />
          <CatchBoundary
            getResetKey={() => "user-layout"}
            errorComponent={ErrorComponent}
          >
            <Outlet />
          </CatchBoundary>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}

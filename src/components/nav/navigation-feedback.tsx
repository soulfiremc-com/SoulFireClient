import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSidebar } from "@/components/ui/sidebar.tsx";

/**
 * Gives immediate feedback for sidebar navigation.
 *
 * The router updates the URL and the active sidebar link before the next page
 * is ready. Route chunks and data can take a moment to load, so the old page
 * would otherwise stay on screen with no sign that the click worked.
 *
 * Render this inside a `SidebarProvider` and a positioned container.
 */
export function NavigationFeedback() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const isPending = useRouterState({
    select: (state) => state.status === "pending",
  });

  // Close the mobile sheet on every navigation, including links to the
  // current page, so the user sees the page they picked.
  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", () => {
        setOpenMobile(false);
      }),
    [router, setOpenMobile],
  );

  if (!isPending) return null;

  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden"
    >
      <span className="sr-only">{t("navigation.pending")}</span>
      {/* The delay keeps fast navigations from flashing the bar. */}
      <div className="h-full w-full animate-in bg-primary delay-150 ease-out animation-duration-1000 fill-mode-backwards fade-in slide-in-from-left motion-reduce:animate-none" />
    </div>
  );
}

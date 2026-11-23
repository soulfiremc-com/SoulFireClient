import { useCallback, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { readSidebarOpen, writeSidebarOpen } from "@/lib/sidebar-state.ts";

/**
 * Keeps the desktop sidebar open or collapsed across reloads and between the
 * user and project layouts. Without a saved choice, it opens on wide screens.
 */
export function useStoredSidebarOpen() {
  const isMobile = useIsMobile();
  const [stored, setStored] = useState(() => readSidebarOpen(localStorage));
  const setOpen = useCallback((open: boolean) => {
    setStored(open);
    writeSidebarOpen(localStorage, open);
  }, []);

  return { open: stored ?? !isMobile, setOpen };
}

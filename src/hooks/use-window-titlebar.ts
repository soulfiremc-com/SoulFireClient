import { useIsMobile } from "@/hooks/use-mobile.ts";
import { isDesktopApp } from "@/lib/platform.ts";

export const WINDOW_TITLEBAR_HEIGHT = "2rem";

export function useShouldShowWindowTitlebar() {
  const isMobile = useIsMobile();
  const desktopApp = isDesktopApp();

  return desktopApp || !isMobile;
}

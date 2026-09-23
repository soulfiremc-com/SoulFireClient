import { SiDiscord } from "@icons-pack/react-simple-icons";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import {
  BookOpenTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  MinusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCurrentRouteChrome } from "@/hooks/use-current-route-title.ts";
import { useShouldShowWindowTitlebar } from "@/hooks/use-window-titlebar.ts";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import type { SoulFireDesktopApi } from "@/lib/desktop-api";
import { cn } from "@/lib/utils.tsx";

const titlebarClassName =
  "window-topbar border-sidebar-border bg-sidebar text-sidebar-foreground grid h-(--titlebar-height) shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch border-b";

const titlebarButtonClassName =
  "text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:text-sidebar-foreground/35 disabled:hover:bg-transparent m-0 h-full w-8 rounded-none! p-0 shadow-none transition-colors";

type TitlebarLink = {
  title: string;
  url: string;
  icon: ComponentType<{
    className?: string;
  }>;
};

function TitlebarExternalLinks() {
  const { t } = useTranslation("common");
  const items: TitlebarLink[] = [
    {
      title: t("sidebar.documentation"),
      url: "https://soulfiremc.com/docs?utm_source=soulfire-client&utm_medium=app&utm_campaign=titlebar-docs",
      icon: BookOpenTextIcon,
    },
    {
      title: t("sidebar.supportSoulFire"),
      url: "https://soulfiremc.com/pricing?utm_source=soulfire-client&utm_medium=app&utm_campaign=titlebar-support",
      icon: HeartIcon,
    },
    {
      title: t("sidebar.discord"),
      url: "https://soulfiremc.com/discord?utm_source=soulfire-client&utm_medium=app&utm_campaign=titlebar-discord",
      icon: SiDiscord,
    },
  ];

  return (
    <div className="flex h-full items-center">
      {items.map((item) => (
        <Button
          key={item.title}
          className={titlebarButtonClassName}
          size="icon-xs"
          variant="ghost"
          nativeButton={false}
          render={<ExternalLink href={item.url} />}
          aria-label={item.title}
          title={item.title}
        >
          <item.icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}

export function WindowControls({
  windowApi,
}: {
  windowApi?: SoulFireDesktopApi["window"] | null;
}) {
  const { t } = useTranslation("common");
  const desktopApp = isDesktopApp();
  const appWindow = useMemo(
    () =>
      windowApi === undefined
        ? desktopApp
          ? desktop.window
          : null
        : windowApi,
    [desktopApp, windowApi],
  );
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) {
      return;
    }

    let disposed = false;
    let unlisten: null | (() => void) = null;
    const syncWindowState = async () => {
      const maximized = await appWindow.isMaximized();
      if (!disposed) {
        setIsMaximized(maximized);
      }
    };

    void syncWindowState();
    void appWindow
      .onResized(() => {
        void syncWindowState();
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appWindow]);

  const handleMinimize = useCallback(() => {
    if (!appWindow) {
      return;
    }

    void appWindow.minimize();
  }, [appWindow]);

  const handleToggleMaximize = useCallback(() => {
    if (!appWindow) {
      return;
    }

    void (async () => {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize();
        setIsMaximized(false);
      } else {
        await appWindow.maximize();
        setIsMaximized(true);
      }
    })();
  }, [appWindow]);

  const handleClose = useCallback(() => {
    if (!appWindow) {
      return;
    }

    void appWindow.close();
  }, [appWindow]);

  if (!appWindow) {
    return null;
  }

  return (
    <div className="window-topbar-no-drag flex h-full items-center">
      <Button
        className={titlebarButtonClassName}
        size="icon-xs"
        type="button"
        variant="ghost"
        onClick={handleMinimize}
        aria-label={t("window.minimizeLabel")}
        title={t("window.minimize")}
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <Button
        className={titlebarButtonClassName}
        size="icon-xs"
        type="button"
        variant="ghost"
        onClick={handleToggleMaximize}
        aria-label={
          isMaximized ? t("window.restoreLabel") : t("window.maximizeLabel")
        }
        title={isMaximized ? t("window.restore") : t("window.maximize")}
      >
        <SquareIcon className={cn("size-3", isMaximized && "scale-90")} />
      </Button>
      <Button
        className={cn(
          titlebarButtonClassName,
          "hover:bg-destructive hover:text-white active:bg-destructive/90",
        )}
        size="icon-xs"
        type="button"
        variant="ghost"
        onClick={handleClose}
        aria-label={t("window.closeLabel")}
        title={t("window.close")}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

export function WindowTitlebar() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const desktopApp = isDesktopApp();
  const shouldShowWindowTitlebar = useShouldShowWindowTitlebar();
  const { title: pageTitle, icon: pageIcon } = useCurrentRouteChrome();
  const canGoForward =
    typeof window !== "undefined" &&
    router.history.location.state.__TSR_index < router.history.length - 1;

  const handleBack = useCallback(() => {
    router.history.back();
  }, [router]);

  const handleForward = useCallback(() => {
    router.history.forward();
  }, [router]);

  if (!shouldShowWindowTitlebar) {
    return null;
  }

  return (
    <header
      data-app-drag-region={desktopApp ? "" : undefined}
      className={titlebarClassName}
    >
      {desktopApp && (
        <div className="window-topbar-no-drag col-start-1 flex h-full items-center justify-self-start px-0">
          <Button
            className={titlebarButtonClassName}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={!canGoBack}
            aria-label={t("window.backLabel")}
            title={t("window.back")}
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <Button
            className={titlebarButtonClassName}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={handleForward}
            disabled={!canGoForward}
            aria-label={t("window.forwardLabel")}
            title={t("window.forward")}
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      )}
      <div
        data-app-drag-region={desktopApp ? "" : undefined}
        className="col-start-2 flex min-w-0 items-center justify-center px-3"
      >
        <div
          data-app-drag-region={desktopApp ? "" : undefined}
          className="flex min-w-0 w-[min(32rem,calc(100vw-14rem))] max-w-full items-center justify-center gap-1.5 text-center [&>*]:pointer-events-none"
        >
          {pageIcon?.kind === "dynamic" && (
            <DynamicIcon
              name={pageIcon.name}
              className="text-muted-foreground/58 size-3.5 shrink-0"
            />
          )}
          {pageIcon?.kind === "logo" && (
            <img
              src={pageIcon.src}
              alt={pageIcon.alt}
              className="size-3.5 shrink-0 rounded-sm object-cover"
            />
          )}
          <p className="text-muted-foreground/58 truncate text-2xs font-medium tracking-wide">
            {pageTitle}
          </p>
        </div>
      </div>
      <div className="window-topbar-no-drag col-start-3 flex h-full items-center justify-self-end gap-0 px-0">
        <TitlebarExternalLinks />
        <WindowControls />
      </div>
    </header>
  );
}

export { titlebarClassName };

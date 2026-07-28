import {
  createRootRouteWithContext,
  deepEqual,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import "../App.css";
import { AptabaseProvider, useAptabase } from "@aptabase/react";
import type { GetInstanceMetricsResponse } from "@soulfiremc/sdk/generated/soulfire/metrics_pb";
import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  type QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useTheme } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { type CSSProperties, memo, useEffect, useMemo, useState } from "react";
import { CustomContextMenu } from "@/components/custom-context-menu.tsx";
import { AboutProvider } from "@/components/dialog/about-dialog.tsx";
import { SupportDialogProvider } from "@/components/dialog/support-dialog.tsx";
import {
  type SystemInfo,
  SystemInfoContext,
} from "@/components/providers/system-info-context.tsx";
import { TerminalThemeContext } from "@/components/providers/terminal-theme-context";
import { ThemeProvider } from "@/components/providers/theme-provider.tsx";
import { TailwindIndicator } from "@/components/tailwind-indicator.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  titlebarClassName,
  WindowTitlebar,
} from "@/components/window/window-titlebar.tsx";
import { useCurrentRouteTitle } from "@/hooks/use-current-route-title.ts";
import { useDiscordPresence } from "@/hooks/use-discord-presence.ts";
import {
  useShouldShowWindowTitlebar,
  WINDOW_TITLEBAR_HEIGHT,
} from "@/hooks/use-window-titlebar.ts";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import { buildDocumentTitle } from "@/lib/route-title.ts";
import { getTerminalTheme } from "@/lib/utils.tsx";

async function getAvailableProfiles() {
  const profileDir = await desktop.path.resolve(
    await desktop.path.appConfigDir(),
    "profile",
  );
  await desktop.fs.mkdir(profileDir, { recursive: true });

  return (await desktop.fs.readDir(profileDir))
    .filter((file) => file.isFile)
    .filter((file) => file.name)
    .map((file) => file.name)
    .filter((file) => file.endsWith(".json"));
}

function isMobile(osType: string) {
  return osType === "android" || osType === "ios";
}

async function createSystemInfo() {
  const [desktopInfo, availableProfiles, sfServerVersion] = await Promise.all([
    desktop.system.getInfo(),
    getAvailableProfiles(),
    desktop.integratedServer.getVersion(),
  ]);
  const osType = desktopInfo.os.type;

  return {
    availableProfiles,
    osType,
    osVersion: desktopInfo.os.version,
    platformName: desktopInfo.os.platform,
    osLocale: desktopInfo.os.locale,
    archName: desktopInfo.os.arch,
    mobile: isMobile(osType),
    sfServerVersion,
  };
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  loader: async () => {
    let systemInfo: SystemInfo | null;
    if (isDesktopApp()) {
      systemInfo = await createSystemInfo();
    } else {
      systemInfo = null;
    }

    return {
      systemInfo,
    };
  },
  component: RootLayout,
  // To make pendingComponent work on root route
  wrapInSuspense: true,
  pendingComponent: RootPending,
});

function RootPending() {
  const shouldShowWindowTitlebar = useShouldShowWindowTitlebar();
  const appShellStyle = {
    "--titlebar-height": shouldShowWindowTitlebar
      ? WINDOW_TITLEBAR_HEIGHT
      : "0px",
  } as CSSProperties;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <WindowThemeSyncer />
      <div
        vaul-drawer-wrapper=""
        className="flex h-dvh w-dvw flex-col"
        style={appShellStyle}
      >
        {shouldShowWindowTitlebar && <div className={titlebarClassName} />}
      </div>
    </ThemeProvider>
  );
}

function PointerReset() {
  const location = useLocation();

  // Avoid mobile pointer events issues
  // When dropdowns were open when page is switched, sometimes the body still has pointer-events: none
  // This will reset it to auto
  useEffect(() => {
    console.debug("Resetting pointers because switched to ", location.pathname);
    document.body.style.pointerEvents = "auto";
  }, [location.pathname]);

  return null;
}

const AppStartedEvent = memo(() => {
  const { trackEvent } = useAptabase();
  const [appLoaded, setAppLoaded] = useState(false);

  useEffect(() => {
    if (!appLoaded) {
      void trackEvent("app_loaded");
      setAppLoaded(true);
    }
  }, [appLoaded, trackEvent]);

  return null;
});

const DocumentTitleSyncer = memo(() => {
  const pageTitle = useCurrentRouteTitle();

  useEffect(() => {
    document.title = buildDocumentTitle(pageTitle);
  }, [pageTitle]);

  return null;
});

const PageChangedEvent = memo(() => {
  const { trackEvent } = useAptabase();
  const location = useLocation();

  useEffect(() => {
    void trackEvent("page_changed", { path: location.pathname });
  }, [location.pathname, trackEvent]);

  return null;
});

function getPresenceForPath(
  pathname: string,
  queryClient: QueryClient,
): { state: string; details?: string } {
  const instanceMatch = pathname.match(/\/instance\/([^/]+)(?:\/(.*))?/);
  if (instanceMatch) {
    const instanceId = instanceMatch[1];
    const subPage = instanceMatch[2] ?? "";

    const metrics = queryClient.getQueryData<GetInstanceMetricsResponse>([
      "instance-metrics",
      instanceId,
    ]);
    const snapshots = metrics?.snapshots;
    const lastSnapshot = snapshots?.[snapshots.length - 1];
    const botInfo = lastSnapshot
      ? `${lastSnapshot.botsOnline}/${lastSnapshot.botsTotal} bots online`
      : undefined;

    if (subPage.startsWith("bot/"))
      return { state: "Controlling a bot", details: botInfo };
    if (subPage === "bots") return { state: "Managing bots", details: botInfo };
    if (subPage.startsWith("script/"))
      return { state: "Editing a script", details: botInfo };
    if (subPage === "scripts")
      return { state: "Managing scripts", details: botInfo };
    if (subPage === "accounts")
      return { state: "Managing accounts", details: botInfo };
    if (subPage === "proxies")
      return { state: "Managing proxies", details: botInfo };
    if (subPage === "discover")
      return { state: "Discovering servers", details: botInfo };
    if (subPage === "terminal")
      return { state: "Viewing terminal", details: botInfo };
    if (subPage === "audit-log")
      return { state: "Viewing audit log", details: botInfo };
    if (subPage === "meta")
      return { state: "Editing metadata", details: botInfo };
    if (subPage.startsWith("settings"))
      return { state: "Configuring settings", details: botInfo };

    return { state: "Viewing instance overview", details: botInfo };
  }

  if (pathname.includes("/user/admin"))
    return { state: "Server administration" };
  if (pathname.includes("/user/settings")) return { state: "User settings" };
  if (pathname.includes("/user/access")) return { state: "Managing access" };
  if (pathname.includes("/user")) return { state: "User profile" };

  if (pathname === "/") return { state: "Logging in" };

  return { state: "Browsing dashboard" };
}

function DiscordPresenceUpdater() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const presence = useMemo(
    () => getPresenceForPath(location.pathname, queryClient),
    [location.pathname, queryClient],
  );

  useDiscordPresence(presence.state, presence.details);

  return null;
}

function WindowThemeSyncer() {
  const { theme } = useTheme();

  useEffect(() => {
    if (isDesktopApp()) {
      if (theme === "dark") {
        void desktop.app.setTheme("dark");
      } else if (theme === "light") {
        void desktop.app.setTheme("light");
      } else if (theme === "system") {
        void desktop.app.setTheme(null);
      }
    }
  }, [theme]);

  return null;
}

function RootLayout() {
  const { systemInfo } = Route.useLoaderData();
  const { queryClient } = Route.useRouteContext();
  const shouldShowWindowTitlebar = useShouldShowWindowTitlebar();
  const [systemInfoState, setSystemInfoState] = useState<SystemInfo | null>(
    systemInfo,
  );
  const [terminalTheme, setTerminalTheme] = useState(getTerminalTheme());
  const appShellStyle = {
    "--titlebar-height": shouldShowWindowTitlebar
      ? WINDOW_TITLEBAR_HEIGHT
      : "0px",
  } as CSSProperties;

  useEffect(() => {
    if (isDesktopApp()) {
      let didUnmount = false;
      let unwatch: null | (() => void) = null;
      void (async () => {
        const profileDir = await desktop.path.resolve(
          await desktop.path.appConfigDir(),
          "profile",
        );
        const unwatchFn = await desktop.fs.watch(
          profileDir,
          () => {
            void createSystemInfo().then((newSystemInfo) => {
              setSystemInfoState((oldSystemInfo) => {
                if (deepEqual(oldSystemInfo, newSystemInfo)) {
                  return oldSystemInfo;
                } else {
                  return newSystemInfo;
                }
              });
            });
          },
          {
            delayMs: 500,
            recursive: true,
          },
        );

        if (didUnmount) {
          unwatchFn();
        } else {
          unwatch = unwatchFn;
        }
      })();

      return () => {
        didUnmount = true;
        if (unwatch) {
          unwatch();
        }
      };
    }
  }, []);

  return (
    <NuqsAdapter>
      <AptabaseProvider
        appKey="A-SH-6467566517"
        options={{
          apiUrl: "https://aptabase.pistonmaster.net/api/v0/event",
          appVersion: APP_VERSION,
        }}
      >
        <AppStartedEvent />
        <PageChangedEvent />
        <DocumentTitleSyncer />
        <QueryClientProvider client={queryClient}>
          <DiscordPresenceUpdater />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <WindowThemeSyncer />
            <TooltipProvider delay={500}>
              <SystemInfoContext value={systemInfoState}>
                <TerminalThemeContext
                  value={{
                    value: terminalTheme,
                    setter: setTerminalTheme,
                  }}
                >
                  <div
                    vaul-drawer-wrapper=""
                    className="flex h-dvh w-dvw flex-col"
                    style={appShellStyle}
                  >
                    <PointerReset />
                    <CustomContextMenu />
                    <AboutProvider>
                      <SupportDialogProvider>
                        {shouldShowWindowTitlebar && <WindowTitlebar />}
                        <div className="flex min-h-0 flex-1 flex-col">
                          <Outlet />
                        </div>
                        <TanStackDevtools
                          plugins={[
                            {
                              name: "TanStack Query",
                              render: <ReactQueryDevtoolsPanel />,
                            },
                            {
                              name: "TanStack Router",
                              render: <TanStackRouterDevtoolsPanel />,
                            },
                          ]}
                        />
                      </SupportDialogProvider>
                    </AboutProvider>
                  </div>
                </TerminalThemeContext>
              </SystemInfoContext>
              <Toaster richColors />
            </TooltipProvider>
          </ThemeProvider>
          <TailwindIndicator />
        </QueryClientProvider>
      </AptabaseProvider>
    </NuqsAdapter>
  );
}

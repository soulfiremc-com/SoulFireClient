import {
  createRootRouteWithContext,
  deepEqual,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import "../App.css";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { type QueryClient, skipToken, useQuery } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useTheme } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { PostHogProvider } from "posthog-js/react";
import { memo, useEffect, useState } from "react";
import { CustomContextMenu } from "@/components/custom-context-menu.tsx";
import { AboutProvider } from "@/components/dialog/about-dialog.tsx";
import {
  type SystemInfo,
  SystemInfoContext,
} from "@/components/providers/system-info-context.tsx";
import { CookieConsentProvider } from "@/components/providers/cookie-consent-provider";
import { TerminalThemeContext } from "@/components/providers/terminal-theme-context";
import { ThemeProvider } from "@/components/providers/theme-provider.tsx";
import { SkipToContent } from "@/components/skip-to-content.tsx";
import { TailwindIndicator } from "@/components/tailwind-indicator.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { UpdateReadyPrompt } from "@/components/update-ready-prompt.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { titlebarClassName } from "@/components/window/titlebar-class-name.ts";
import { WindowTitlebar } from "@/components/window/window-titlebar.tsx";
import type { GetInstanceMetricsResponse } from "@/generated/soulfire/metrics_pb";
import { useCurrentRouteTitle } from "@/hooks/use-current-route-title.ts";
import { useDiscordPresence } from "@/hooks/use-discord-presence.ts";
import {
  useShouldShowWindowTitlebar,
  WINDOW_TITLEBAR_HEIGHT,
} from "@/hooks/use-window-titlebar.ts";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import posthog from "@/lib/posthog.ts";
import { buildDocumentTitle } from "@/lib/route-title.ts";
import { getTerminalTheme } from "@/lib/utils.tsx";

async function getAvailableProfiles() {
  try {
    return await readProfileNames();
  } catch (error) {
    // A missing or unreadable profile folder must not stop the app from
    // loading. The profile pickers show an empty list instead.
    console.error(error);
    return [];
  }
}

async function readProfileNames() {
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

async function createSystemInfo() {
  const [desktopInfo, availableProfiles, sfServerVersion] = await Promise.all([
    desktop.system.getInfo(),
    getAvailableProfiles(),
    desktop.integratedServer.getVersion(),
  ]);
  return {
    availableProfiles,
    osType: desktopInfo.os.type,
    osVersion: desktopInfo.os.version,
    platformName: desktopInfo.os.platform,
    osLocale: desktopInfo.os.locale,
    archName: desktopInfo.os.arch,
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
  // RootLayout reads systemInfo once and the profile watcher keeps it current,
  // so reloading it on every navigation would only repeat desktop calls.
  staleTime: Number.POSITIVE_INFINITY,
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
  };

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <WindowThemeSyncer />
      <div className="flex h-dvh w-dvw flex-col" style={appShellStyle}>
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
    document.body.style.pointerEvents = "auto";
  }, [location.pathname]);

  return null;
}

const DocumentTitleSyncer = memo(function DocumentTitleSyncer() {
  const pageTitle = useCurrentRouteTitle();

  useEffect(() => {
    document.title = buildDocumentTitle(pageTitle);
  }, [pageTitle]);

  return null;
});

const INSTANCE_PATH = /\/instance\/([^/]+)(?:\/(.*))?/u;

function getPresenceForPath(
  pathname: string,
  botInfo: string | undefined,
): { state: string; details?: string | undefined } {
  const instanceMatch = pathname.match(INSTANCE_PATH);
  if (instanceMatch) {
    const subPage = instanceMatch[2] ?? "";

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

    return { state: "Viewing project overview", details: botInfo };
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
  const { pathname } = useLocation();
  const instanceId = pathname.match(INSTANCE_PATH)?.[1];
  // Read the metrics that the instance pages poll, without fetching them here,
  // so the bot count follows each poll.
  const { data: botInfo } = useQuery({
    queryKey: ["instance-metrics", instanceId],
    queryFn: skipToken,
    select: (metrics: GetInstanceMetricsResponse) => {
      const lastSnapshot = metrics.snapshots.at(-1);
      return lastSnapshot
        ? `${lastSnapshot.botsOnline}/${lastSnapshot.botsTotal} bots online`
        : undefined;
    },
  });
  const presence = getPresenceForPath(pathname, botInfo);

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
  const shouldShowWindowTitlebar = useShouldShowWindowTitlebar();
  const [systemInfoState, setSystemInfoState] = useState<SystemInfo | null>(
    systemInfo,
  );
  const [terminalTheme, setTerminalTheme] = useState(getTerminalTheme());
  const appShellStyle = {
    "--titlebar-height": shouldShowWindowTitlebar
      ? WINDOW_TITLEBAR_HEIGHT
      : "0px",
  };

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
            void createSystemInfo()
              .then((newSystemInfo) => {
                setSystemInfoState((oldSystemInfo) => {
                  if (deepEqual(oldSystemInfo, newSystemInfo)) {
                    return oldSystemInfo;
                  }
                  return newSystemInfo;
                });
              })
              .catch(console.error);
          },
          {
            delayMs: 500,
            recursive: true,
          },
        );

        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the effect cleanup sets didUnmount while the watcher starts
        if (didUnmount) {
          unwatchFn();
        } else {
          unwatch = unwatchFn;
        }
      })().catch((error: unknown) => {
        // Without the watcher the profile list keeps its startup value.
        console.error(error);
      });

      return () => {
        didUnmount = true;
        if (unwatch) {
          unwatch();
        }
      };
    }
    return undefined;
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <NuqsAdapter>
        <DocumentTitleSyncer />
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
                  className="flex h-dvh w-dvw flex-col"
                  style={appShellStyle}
                >
                  <SkipToContent />
                  <PointerReset />
                  <CustomContextMenu />
                  <CookieConsentProvider>
                    <AboutProvider>
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
                    </AboutProvider>
                  </CookieConsentProvider>
                </div>
              </TerminalThemeContext>
            </SystemInfoContext>
            <Toaster richColors />
            <UpdateReadyPrompt />
          </TooltipProvider>
        </ThemeProvider>
        <TailwindIndicator />
      </NuqsAdapter>
    </PostHogProvider>
  );
}

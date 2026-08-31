"use client";

import { flavorEntries } from "@catppuccin/palette";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import {
  ActivityIcon,
  ChevronsUpDown,
  CircleHelpIcon,
  FolderIcon,
  HeartHandshakeIcon,
  LanguagesIcon,
  LaptopMinimalIcon,
  LogOutIcon,
  MoonIcon,
  PaintRollerIcon,
  PowerIcon,
  SunIcon,
  SunMoonIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Suspense, use, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AboutContext } from "@/components/dialog/about-dialog.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import { IntegratedServerDiagnosticsDialog } from "@/components/IntegratedServerDiagnostics";
import CastMenuEntry from "@/components/nav/cast-menu-entry.tsx";
import { SystemInfoContext } from "@/components/providers/system-info-context.tsx";
import { TerminalThemeContext } from "@/components/providers/terminal-theme-context.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import {
  getLanguageName,
  languageEmoji,
  runAsync,
  setTerminalTheme,
} from "@/lib/utils.tsx";
import {
  getServerType,
  isImpersonating,
  logOut,
  stopImpersonation,
} from "@/lib/web-rpc.ts";

function SidebarAccountButton() {
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);

  return (
    <DropdownMenuTrigger
      render={
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          tooltip={`${clientInfo.username} | ${clientInfo.email}`}
        />
      }
    >
      <UserAvatar
        username={clientInfo.username}
        email={clientInfo.email}
        className="size-8"
      />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{clientInfo.username}</span>
        <span className="truncate text-xs">{clientInfo.email}</span>
      </div>
      <ChevronsUpDown className="ml-auto size-4" />
    </DropdownMenuTrigger>
  );
}

function SidebarAccountButtonSkeleton() {
  return (
    <DropdownMenuTrigger
      render={
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        />
      }
    >
      <Skeleton className="relative flex size-8 h-10 w-10 shrink-0 overflow-hidden rounded-lg" />
      <div className="grid flex-1 gap-2 text-left text-sm leading-tight">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <ChevronsUpDown className="ml-auto size-4" />
    </DropdownMenuTrigger>
  );
}

function DropdownAccountHeader() {
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);

  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <UserAvatar
        username={clientInfo.username}
        email={clientInfo.email}
        className="size-8"
      />
      <div className="grid flex-1">
        <span className="truncate font-semibold">{clientInfo.username}</span>
        <span className="truncate text-xs">{clientInfo.email}</span>
      </div>
    </div>
  );
}

function DropdownAccountHeaderSkeleton() {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
      <Skeleton className="size-8 rounded-lg" />
      <div className="grid flex-1 gap-2 text-left text-sm leading-tight">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function NavAccount() {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const terminalTheme = use(TerminalThemeContext);
  const { openAbout } = use(AboutContext);
  const systemInfo = use(SystemInfoContext);
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <IntegratedServerDiagnosticsDialog
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />
      <SidebarMenuItem>
        <DropdownMenu>
          <Suspense fallback={<SidebarAccountButtonSkeleton />}>
            <SidebarAccountButton />
          </Suspense>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <Suspense fallback={<DropdownAccountHeaderSkeleton />}>
                  <DropdownAccountHeader />
                </Suspense>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PaintRollerIcon />
                  {t("userSidebar.theme.title")}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={(value) => {
                        if (value) {
                          setTheme(value);
                        }
                      }}
                    >
                      <DropdownMenuRadioItem value="system">
                        <SunMoonIcon className="mr-1 h-4" />
                        {t("userSidebar.theme.system")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <MoonIcon className="mr-1 h-4" />
                        {t("userSidebar.theme.dark")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light">
                        <SunIcon className="mr-1 h-4" />
                        {t("userSidebar.theme.light")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LaptopMinimalIcon />
                  {t("userSidebar.terminal.title")}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={terminalTheme.value}
                      onValueChange={(value) => {
                        if (value) {
                          setTerminalTheme(value);
                          terminalTheme.setter(value);
                        }
                      }}
                    >
                      {flavorEntries.map((entry) => (
                        <DropdownMenuRadioItem key={entry[0]} value={entry[0]}>
                          {entry[1].emoji} {entry[1].name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon />
                  {t("locale")}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={i18n.resolvedLanguage ?? i18n.language}
                      onValueChange={(value) => {
                        if (value) {
                          void i18n.changeLanguage(value);
                        }
                      }}
                      className="grid grid-cols-1 md:grid-cols-2"
                    >
                      {(i18n.options.supportedLngs
                        ? i18n.options.supportedLngs
                        : []
                      )
                        .filter((lang) => lang !== "cimode")
                        .map((lang) => (
                          <DropdownMenuRadioItem key={lang} value={lang}>
                            {languageEmoji(lang)} {getLanguageName(lang, lang)}
                          </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        render={
                          <ExternalLink href="https://translate.soulfiremc.com?utm_source=soulfire-client&utm_medium=app&utm_campaign=settings-translate" />
                        }
                      >
                        <HeartHandshakeIcon />
                        {t("userSidebar.helpTranslate")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            {isDesktopApp() && systemInfo && !systemInfo.mobile && (
              <>
                <DropdownMenuSeparator />
                <CastMenuEntry />
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      runAsync(async () => {
                        await desktop.shell.openPath(
                          await desktop.path.appConfigDir(),
                        );
                      });
                    }}
                  >
                    <FolderIcon />
                    {t("userSidebar.configDir")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      runAsync(async () => {
                        await desktop.shell.openPath(
                          await desktop.path.appLocalDataDir(),
                        );
                      });
                    }}
                  >
                    <FolderIcon />
                    {t("userSidebar.dataDir")}
                  </DropdownMenuItem>
                  {getServerType() === "integrated" && (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          void desktop.integratedServer
                            .openDataDirectory()
                            .catch((error) =>
                              toast.error(
                                t("integratedDiagnostics.openDirectoryError"),
                                { description: String(error) },
                              ),
                            );
                        }}
                      >
                        <FolderIcon />
                        {t("integratedDiagnostics.openDirectory")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDiagnosticsOpen(true)}
                      >
                        <ActivityIcon />
                        {t("integratedDiagnostics.title")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={
                  <ExternalLink href="https://soulfiremc.com/pricing?utm_source=soulfire-client&utm_medium=app&utm_campaign=account-menu-support" />
                }
              >
                <HeartHandshakeIcon />
                {t("userSidebar.supportSoulFire")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openAbout}>
                <CircleHelpIcon />
                {t("userSidebar.about")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {isImpersonating() && (
                <DropdownMenuItem
                  onClick={() => {
                    stopImpersonation();
                    void navigate({
                      to: "/user",
                      replace: true,
                      reloadDocument: true,
                    });
                  }}
                >
                  <VenetianMaskIcon />
                  {t("userSidebar.stopImpersonating")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  const disconnect = async () => {
                    if (isDesktopApp()) {
                      await desktop.integratedServer.kill();
                    }
                    logOut();
                    await navigate({
                      to: "/",
                      replace: true,
                    });
                  };
                  toast.promise(disconnect(), {
                    loading: t("userSidebar.logOutToast.loading"),
                    success: t("userSidebar.logOutToast.success"),
                    error: (e) => {
                      console.error(e);
                      return t("userSidebar.logOutToast.error");
                    },
                  });
                }}
              >
                <LogOutIcon />
                {t("userSidebar.logOut")}
              </DropdownMenuItem>
              {isDesktopApp() && (
                <DropdownMenuItem
                  onClick={() => {
                    void desktop.app.quit();
                  }}
                >
                  <PowerIcon />
                  {t("userSidebar.exit")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

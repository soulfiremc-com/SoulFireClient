import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { use, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircuitBackground } from "@/components/launcher/circuit-background.tsx";
import { ConnectionChoices } from "@/components/launcher/connection-choices.tsx";
import { DedicatedMenu } from "@/components/launcher/dedicated-menu.tsx";
import { EmailCodeMenu } from "@/components/launcher/email-code-menu.tsx";
import { IntegratedMenu } from "@/components/launcher/integrated-menu.tsx";
import { integratedStartup } from "@/components/launcher/integrated-startup.ts";
import {
  AUTO_START_KEY,
  getIntegratedJarSource,
} from "@/components/launcher/integrated-settings.ts";
import { LauncherFooter } from "@/components/launcher/launcher-footer.tsx";
import { parseLauncherSearch } from "@/components/launcher/launcher-search.ts";
import type {
  AuthFlowData,
  LoginFunction,
  LoginType,
} from "@/components/launcher/launcher-types.ts";
import { ExternalLink } from "@/components/external-link.tsx";
import { SystemInfoContext } from "@/components/providers/system-info-context.tsx";
import type { DesktopIntegratedServerCredentials } from "@/lib/desktop-api.ts";
import { isDesktopApp } from "@/lib/desktop.ts";
import i18n from "@/lib/i18n";
import { SOULFIRE_LOGO_ICON, staticRouteChrome } from "@/lib/route-title.ts";
import { isDemo } from "@/lib/utils.tsx";
import {
  getServerAddress,
  getServerType,
  isAuthenticated,
  setAuthentication,
} from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/")({
  validateSearch: parseLauncherSearch,
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("login:connect.title"), SOULFIRE_LOGO_ICON),
  component: Index,
});

function Index() {
  const { t } = useTranslation("login");
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const systemInfo = use(SystemInfoContext);
  const demo = isDemo();
  // Starts the saved local server at once, unless the user asked to choose
  // again or the saved settings need a custom jar first.
  const [autoStartIntegratedServer, setAutoStartIntegratedServer] = useState(
    () =>
      searchParams.configure !== "true" &&
      isDesktopApp() &&
      systemInfo !== null &&
      isAuthenticated() &&
      getServerType() === "integrated" &&
      (searchParams.startLocal === "true" ||
        localStorage.getItem(AUTO_START_KEY) === "true") &&
      getIntegratedJarSource(localStorage) !== null,
  );
  const [loginType, setLoginType] = useState<LoginType>(
    autoStartIntegratedServer ? "INTEGRATED" : null,
  );
  const [authFlowData, setAuthFlowData] = useState<AuthFlowData | null>(null);

  const redirect = searchParams.redirect;
  const continueToApp = useCallback(async () => {
    await navigate({
      to: redirect ?? "/user",
      replace: true,
      reloadDocument: true,
    });
  }, [navigate, redirect]);

  const redirectWithCredentials: LoginFunction = useCallback(
    async (type, address, token) => {
      setAuthentication(type, address.trim(), token.trim());
      await continueToApp();
    },
    [continueToApp],
  );
  const onIntegratedReady = useCallback(
    (credentials: DesktopIntegratedServerCredentials) =>
      redirectWithCredentials(
        "integrated",
        credentials.address,
        credentials.token,
      ),
    [redirectWithCredentials],
  );
  const consumeAutoStart = useCallback(() => {
    setAutoStartIntegratedServer(false);
  }, []);

  const hasSavedServer =
    !demo && isAuthenticated() && getServerType() === "dedicated";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CircuitBackground />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-(--cookie-banner-offset)">
        <main className="flex min-h-full w-full flex-col">
          <div className="m-auto flex w-full max-w-2xl flex-col gap-4 py-6">
            <ExternalLink
              href="https://soulfiremc.com?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-logo"
              className="flex flex-row items-center justify-center gap-2 text-center"
            >
              <img
                className="size-8"
                width={32}
                height={32}
                src="/logo.png"
                alt={t("header.image.alt")}
              />
              <p className="font-medium tracking-wide">{t("header.title")}</p>
            </ExternalLink>
            {loginType === null && (
              <ConnectionChoices
                demoMode={demo}
                canRunLocally={!demo && systemInfo !== null}
                savedServer={
                  hasSavedServer ? { address: getServerAddress() } : null
                }
                onContinueSaved={() => {
                  void continueToApp();
                }}
                onEnterDemo={() => {
                  void continueToApp();
                }}
                onRunLocally={() => {
                  setLoginType("INTEGRATED");
                }}
                onConnectExisting={() => {
                  setLoginType("DEDICATED");
                }}
              />
            )}
            {loginType === "INTEGRATED" && (
              <IntegratedMenu
                autoStart={autoStartIntegratedServer}
                onAutoStart={consumeAutoStart}
                onReady={onIntegratedReady}
                setLoginType={setLoginType}
                startup={integratedStartup}
              />
            )}
            {loginType === "DEDICATED" && (
              <DedicatedMenu
                setAuthFlowData={setAuthFlowData}
                setLoginType={setLoginType}
                redirectWithCredentials={redirectWithCredentials}
              />
            )}
            {loginType === "EMAIL_CODE" && authFlowData !== null && (
              <EmailCodeMenu
                authFlowData={authFlowData}
                onBack={() => {
                  setLoginType("DEDICATED");
                }}
                onCodeSent={setAuthFlowData}
                redirectWithCredentials={redirectWithCredentials}
              />
            )}
            <LauncherFooter />
          </div>
        </main>
      </div>
    </div>
  );
}

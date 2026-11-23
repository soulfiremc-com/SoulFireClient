import { HeartHandshakeIcon } from "lucide-react";
import { use } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { ModeToggle } from "@/components/mode-toggle.tsx";
import { useCookieConsentContext } from "@/components/providers/cookie-consent-context";
import { SystemInfoContext } from "@/components/providers/system-info-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAppUrl } from "@/lib/app-deployment.ts";
import { isPostHogConfigured } from "@/lib/posthog";
import { getLanguageName, isDemo, languageEmoji } from "@/lib/utils.tsx";

function LanguageMenu() {
  const { t, i18n } = useTranslation("login");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const supportedLanguages = (i18n.options.supportedLngs || []).filter(
    (lang) => lang !== "cimode",
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="text-muted-foreground" size="sm" variant="ghost" />
        }
      >
        {languageEmoji(language)} {getLanguageName(language, language)}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-96">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("common:locale")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={language}
            onValueChange={(value: unknown) => {
              if (typeof value === "string" && value) {
                void i18n.changeLanguage(value);
              }
            }}
            className="grid grid-cols-1 md:grid-cols-2"
          >
            {supportedLanguages.map((lang) => (
              <DropdownMenuRadioItem key={lang} value={lang}>
                {languageEmoji(lang)} {getLanguageName(lang, lang)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={
              <ExternalLink href="https://translate.soulfiremc.com?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-translate" />
            }
          >
            <HeartHandshakeIcon />
            {t("footer.helpTranslate")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The other web build, so testers can switch between production and preview. */
function OtherEnvironmentLink() {
  const { t } = useTranslation("login");
  const systemInfo = use(SystemInfoContext);
  // The desktop app ships one build, so it has nothing to switch to.
  if (systemInfo) return null;
  if (APP_ENVIRONMENT !== "production" && APP_ENVIRONMENT !== "preview")
    return null;
  const target = APP_ENVIRONMENT === "production" ? "preview" : "production";
  return (
    <a
      className="text-info"
      href={`${getAppUrl(target, isDemo())}?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-${target}`}
    >
      {t(`footer.${target}`)}
    </a>
  );
}

export function LauncherFooter() {
  const { t } = useTranslation("login");
  const { openCookiePreferences } = useCookieConsentContext();
  return (
    <footer className="flex flex-col items-center gap-2 text-center text-xs text-balance text-muted-foreground">
      <p>
        <Trans
          i18nKey="login:newUser"
          components={{
            a: (
              <ExternalLink
                href="https://soulfiremc.com/demo-video?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-demo-video"
                className="text-nowrap text-info"
              />
            ),
          }}
        />
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <LanguageMenu />
        <ModeToggle />
        {isPostHogConfigured && (
          <Button variant="link" size="sm" onClick={openCookiePreferences}>
            {t("common:analyticsConsent.preferences")}
          </Button>
        )}
      </div>
      <p className="flex flex-wrap justify-center gap-x-2 select-text">
        {t("footer.version", {
          version: APP_VERSION,
          environment: APP_ENVIRONMENT,
        })}
        <OtherEnvironmentLink />
      </p>
    </footer>
  );
}

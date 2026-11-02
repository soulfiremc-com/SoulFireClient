import { CookieIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CookieConsentBanner({
  onAccept,
  onDecline,
  onClose,
}: {
  onAccept: () => void;
  onDecline: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation("common");
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="ph-no-capture fixed inset-x-3 bottom-3 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto sm:right-auto sm:bottom-4 sm:left-4 sm:w-96"
    >
      <Card>
        <CardHeader>
          <CardTitle id={titleId}>{t("analyticsConsent.title")}</CardTitle>
          <CardAction>
            <CookieIcon aria-hidden="true" className="size-5" />
          </CardAction>
          <CardDescription>{t("analyticsConsent.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t("analyticsConsent.cookieless")}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <ExternalLink
              href="https://soulfiremc.com/privacy-policy"
              className="underline underline-offset-4"
            >
              {t("analyticsConsent.privacyPolicy")}
            </ExternalLink>
            <ExternalLink
              href="https://soulfiremc.com/cookie-policy"
              className="underline underline-offset-4"
            >
              {t("analyticsConsent.cookiePolicy")}
            </ExternalLink>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onDecline}
          >
            {t("analyticsConsent.decline")}
          </Button>
          <Button type="button" className="flex-1" onClick={onAccept}>
            {t("analyticsConsent.accept")}
          </Button>
          {onClose && (
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("close")}
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  );
}

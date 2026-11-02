import { HeartIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  isReminderSurfaceBlocked,
  useReminderSurfaceBlocked,
} from "@/hooks/use-reminder-surface-blocked";
import { supportReminder } from "@/lib/local-support-reminder";
import type { SupportReminderController } from "@/lib/support-reminder";

export function SupportReminder({
  ready,
  reminder = supportReminder,
}: {
  ready: boolean;
  reminder?: SupportReminderController;
}) {
  // Eligibility earned during this visit waits for the next overview visit.
  const [eligibleOnEntry] = useState(() => reminder.isEligible());
  return eligibleOnEntry ? (
    <EligibleReminder ready={ready} reminder={reminder} />
  ) : null;
}

function EligibleReminder({
  ready,
  reminder,
}: {
  ready: boolean;
  reminder: SupportReminderController;
}) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const state = useSyncExternalStore(reminder.subscribe, reminder.getSnapshot);
  const blocked = useReminderSurfaceBlocked();
  const attempted = useRef(false);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!ready || blocked || state.disabled || attempted.current) return;
    // Sibling banners and dialog portals can mount after the render snapshot.
    const frame = requestAnimationFrame(() => {
      if (isReminderSurfaceBlocked()) return;
      attempted.current = true;
      setShown(reminder.markShown());
    });
    return () => cancelAnimationFrame(frame);
  }, [blocked, ready, reminder, state.disabled]);

  function dismiss(reason: "later" | "never" | "supporter") {
    reminder.dismiss(reason);
    setDismissed(true);
  }

  if (!shown || dismissed || !ready || blocked || state.disabled) return null;

  return (
    <Alert role="region" aria-labelledby={titleId}>
      <HeartIcon aria-hidden="true" />
      <AlertTitle id={titleId}>{t("dialog.support.title")}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-3">
          <span>{t("dialog.support.body")}</span>
          <div className="flex flex-wrap gap-2">
            <Button
              nativeButton={false}
              size="sm"
              render={
                <ExternalLink href="https://soulfiremc.com/pricing?utm_source=soulfire-client&utm_medium=app&utm_campaign=support-dialog" />
              }
              onClick={() => dismiss("later")}
            >
              {t("dialog.support.action")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dismiss("later")}
            >
              {t("dialog.support.dismiss")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismiss("supporter")}
            >
              {t("dialog.support.alreadySupport")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss("never")}>
              {t("dialog.support.neverRemind")}
            </Button>
          </div>
          <span>{t("dialog.support.reminderFrequency")}</span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

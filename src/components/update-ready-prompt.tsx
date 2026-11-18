import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";

/**
 * Asks desktop users to restart when an update has downloaded. Restarting stops
 * running bots, so the toast stays until the user chooses. Without a choice,
 * the update installs the next time SoulFire quits.
 */
export function UpdateReadyPrompt() {
  const { t } = useTranslation("common");

  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    let active = true;
    let unlisten: (() => void) | undefined;
    const show = (version: string) => {
      toast.info(t("updateReady.title", { version }), {
        id: "update-ready",
        description: t("updateReady.description"),
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: t("updateReady.restart"),
          onClick: () => void desktop.updates.installNow(),
        },
        cancel: { label: t("updateReady.later"), onClick: () => {} },
      });
    };
    void desktop.updates.getReady().then((version) => {
      if (active && version !== null) show(version);
    });
    void desktop.updates.onReady(show).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [t]);

  return null;
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { WINDOW_TITLEBAR_HEIGHT } from "@/hooks/use-window-titlebar";
import type { PovPlayerStore } from "@/stores/pov-player-store";

const THEME_ATTRIBUTES = ["class", "style", "lang", "dir"];

// Moves the player into a separate window that follows the app theme.
export function usePovPopup({
  playerStore,
  release,
  toasterId,
}: {
  playerStore: PovPlayerStore;
  release: () => void;
  toasterId: string;
}) {
  const { t } = useTranslation("instance");
  const actions = playerStore.actions;
  const [popup, setPopup] = useState<Window | null>(null);

  useEffect(() => {
    if (!popup) return undefined;
    const syncTheme = () => {
      const source = document.documentElement;
      const target = popup.document.documentElement;
      for (const attribute of THEME_ATTRIBUTES) {
        const value = source.getAttribute(attribute);
        if (value === null) target.removeAttribute(attribute);
        else target.setAttribute(attribute, value);
      }
      target.style.setProperty("--titlebar-height", WINDOW_TITLEBAR_HEIGHT);
    };
    syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: THEME_ATTRIBUTES,
    });
    const closed = () => {
      release();
      setPopup(null);
      actions.setFullscreen(false);
    };
    // A reload of this window would leave the popup without its player.
    const closePopup = () => {
      popup.close();
    };
    popup.addEventListener("pagehide", closed);
    window.addEventListener("pagehide", closePopup);
    return () => {
      themeObserver.disconnect();
      popup.removeEventListener("pagehide", closed);
      window.removeEventListener("pagehide", closePopup);
      popup.close();
      // Activity retains state while disconnecting this effect's window.
      setPopup((current) => (current === popup ? null : current));
      actions.setFullscreen(false);
    };
  }, [popup, release, actions]);

  function detach() {
    release();
    const child = window.open(
      "about:blank",
      "soulfire-pov",
      "popup,width=1280,height=800",
    );
    if (!child) {
      toast.error(t("instance:bots.pov.popupBlocked"), { toasterId });
      return;
    }
    // The named window may be reused. Replace whatever it showed before.
    const doc = child.document;
    doc.head.replaceChildren(
      ...Array.from(
        document.querySelectorAll('link[rel="stylesheet"], style'),
        (style) => style.cloneNode(true),
      ),
    );
    doc.body.replaceChildren();
    doc.title = t("instance:bots.pov.windowTitle");
    doc.body.style.margin = "0";
    setPopup(child);
  }

  return {
    popup,
    detach,
    attach: () => {
      setPopup(null);
    },
  };
}

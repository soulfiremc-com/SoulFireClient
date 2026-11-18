import { toast } from "sonner";
import { desktop, isDesktopApp } from "@/lib/desktop";
import { t } from "i18next";

export async function copyMinecraftText(text: string, win: Window = window) {
  try {
    await (isDesktopApp()
      ? desktop.clipboard.writeText(text)
      : win.navigator.clipboard.writeText(text));
  } catch {
    toast.error(t("common:minecraftActions.copyError"));
  }
}

export function openMinecraftUrl(
  value: string,
  win: Window = window,
  beforeOpen?: () => void,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  beforeOpen?.();
  if (isDesktopApp()) {
    void desktop.shell
      .openExternal(url.href)
      .catch(() => toast.error(t("common:minecraftActions.openError")));
    return;
  }
  const opened = win.open("about:blank", "_blank");
  if (opened) {
    opened.opener = null;
    opened.location.href = url.href;
    return;
  }
  toast.info(t("common:minecraftActions.popupBlocked"), {
    action: {
      label: t("common:minecraftActions.openLink"),
      onClick: () => win.open(url.href, "_blank", "noopener,noreferrer"),
    },
  });
}

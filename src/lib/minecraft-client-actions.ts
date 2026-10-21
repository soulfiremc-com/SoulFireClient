import { toast } from "sonner";
import { desktop, isDesktopApp } from "@/lib/desktop";

export function copyMinecraftText(text: string, win: Window = window) {
  void (
    isDesktopApp()
      ? desktop.clipboard.writeText(text)
      : win.navigator.clipboard.writeText(text)
  ).catch(() =>
    toast.error("Allow clipboard access to copy text from Minecraft."),
  );
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
      .catch(() => toast.error("Could not open the link."));
    return;
  }
  const opened = win.open("about:blank", "_blank");
  if (opened) {
    opened.opener = null;
    opened.location.href = url.href;
    return;
  }
  toast.info("Your browser blocked the new tab.", {
    action: {
      label: "Open link",
      onClick: () => win.open(url.href, "_blank", "noopener,noreferrer"),
    },
  });
}

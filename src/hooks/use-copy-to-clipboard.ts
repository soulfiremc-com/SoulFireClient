import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";

async function copyToClipboard(text: string): Promise<void> {
  if (isDesktopApp()) {
    await desktop.clipboard.writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  } else {
    return `${text.slice(0, maxLength - 3)}...`;
  }
}

export function useCopyToClipboard() {
  const { t } = useTranslation("common");

  return useCallback<(text: string) => void>(
    (text) => {
      toast.promise(copyToClipboard(text), {
        loading: t("clipboardCopy.loading"),
        success: t("clipboardCopy.success", { content: truncate(text, 50) }),
        error: t("clipboardCopy.error"),
      });
    },
    [t],
  );
}

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

export function useCopyToClipboard(options?: { sensitive?: boolean }) {
  const { t } = useTranslation("common");
  const sensitive = options?.sensitive ?? false;

  // Resolves to whether the copy worked, so callers can confirm it in place.
  return useCallback<(text: string) => Promise<boolean>>(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        console.error(error);
        toast.error(t("clipboardCopy.error"));
        return false;
      }
      toast.success(
        sensitive
          ? t("clipboardCopy.sensitiveSuccess")
          : t("clipboardCopy.success", { content: truncate(text, 50) }),
      );
      return true;
    },
    [t, sensitive],
  );
}

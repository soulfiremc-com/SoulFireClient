import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SettingsDefinition } from "@/generated/soulfire/common_pb";

export function useSettingSaveError(
  definition: SettingsDefinition | undefined,
  identifier: string,
) {
  const { t } = useTranslation("common");
  return () => {
    const type = definition?.type;
    const name =
      type?.case === "minMax"
        ? [type.value.minEntry?.uiName, type.value.maxEntry?.uiName]
            .filter(Boolean)
            .join(" / ")
        : type?.value?.uiName;
    toast.error(t("settingsPage.saveError", { name: name || identifier }), {
      id: `setting-save:${identifier}`,
    });
  };
}

import type { JsonValue } from "@bufbuild/protobuf";
import {
  CheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import type { SettingsDefinition } from "@/generated/soulfire/common_pb";
import { displayText } from "@/lib/display-text";
import {
  formatSettingNumber,
  isNumericRange,
} from "@/lib/numeric-setting-value.ts";
import {
  getSettingDefaultValue,
  isSameSettingValue,
} from "@/lib/setting-default-value.ts";

function formatDefault(
  value: JsonValue,
  definition: SettingsDefinition,
  formatNumber: (value: number) => string,
  formatRange: (min: string, max: string) => string,
) {
  switch (definition.type.case) {
    case "stringList": {
      return undefined;
    }
    case "combo": {
      return definition.type.value.options.find((option) => option.id === value)
        ?.displayName;
    }
    case "minMax": {
      return isNumericRange(value)
        ? formatRange(formatNumber(value.min), formatNumber(value.max))
        : undefined;
    }
    case "int":
    case "double": {
      return typeof value === "number" ? formatNumber(value) : undefined;
    }
    case "string":
    case "bool":
    case undefined:
    default: {
      return typeof value === "boolean" || value === ""
        ? undefined
        : displayText(value);
    }
  }
}

/**
 * Reports the save result next to the setting that changed. The default and
 * the reset button only appear once the value differs from the default.
 */
export function SettingStatusRow(props: {
  definition: SettingsDefinition;
  value: JsonValue;
  status: "idle" | "pending" | "success" | "error";
  persisted: boolean;
  onReset: (value: JsonValue) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const type = props.definition.type;
  const defaultValue = getSettingDefaultValue(props.definition);
  const changed =
    defaultValue !== undefined &&
    !isSameSettingValue(props.value, defaultValue);
  const showStatus =
    props.status === "error" || (props.persisted && props.status !== "idle");
  if (!changed && !showStatus) {
    return null;
  }
  const label = changed
    ? formatDefault(
        defaultValue,
        props.definition,
        (value) =>
          formatSettingNumber(
            value,
            i18n.language,
            (type.case === "int" ||
              type.case === "double" ||
              type.case === "minMax") &&
              type.value.thousandSeparator,
          ),
        (min, max) => t("settingsPage.rangeValue", { min, max }),
      )
    : undefined;
  return (
    <div
      data-slot="setting-status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      {label !== undefined && (
        <span>{t("settingsPage.defaultValue", { value: label })}</span>
      )}
      {changed && !type.value?.disabled && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            props.onReset(defaultValue);
          }}
        >
          <RotateCcwIcon data-icon="inline-start" />
          {t("settingsPage.resetToDefault")}
        </Button>
      )}
      <span aria-live="polite" className="inline-flex items-center gap-1">
        {props.persisted && props.status === "pending" && (
          <>
            <LoaderCircleIcon className="size-3 animate-spin" />
            {t("settingsPage.saving")}
          </>
        )}
        {props.persisted && props.status === "success" && (
          <span className="inline-flex items-center gap-1 text-success-emphasis">
            <CheckIcon className="size-3" />
            {t("settingsPage.saved")}
          </span>
        )}
        {props.status === "error" && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <CircleAlertIcon className="size-3" />
            {t("settingsPage.notSaved")}
          </span>
        )}
      </span>
    </div>
  );
}

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { NumericFormat } from "react-number-format";
import {
  ComponentTitle,
  SettingInputLayout,
} from "@/components/settings/setting-layout.tsx";
import { useSettingDraft } from "@/components/settings/use-setting-draft.ts";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import type {
  DoubleSetting,
  IntSetting,
  MinMaxSetting,
} from "@/generated/soulfire/common_pb";
import { useLocaleNumberFormat } from "@/hooks/use-locale-number-format.tsx";
import { NumericRangeEditor } from "@/lib/numeric-range-editor.ts";
import {
  formatSettingNumber,
  getNumericSettingValue,
  type NumericRange,
} from "@/lib/numeric-setting-value.ts";
import { requireField } from "@/lib/require-field";

export function NumericSettingField(props: {
  setting: IntSetting | DoubleSetting | MinMaxSetting;
  entry: Pick<IntSetting, "uiName" | "description" | "placeholder">;
  value: number;
  changeCallback: (value: number) => void | Promise<void>;
  onFocus?: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const id = useId();
  const localeNumberFormat = useLocaleNumberFormat();
  const field = useSettingDraft<string | number, number>({
    value: props.value,
    commit: props.changeCallback,
  });
  const decimalScale =
    "decimalScale" in props.setting ? props.setting.decimalScale : 0;
  const parse = (draft: string | number) =>
    getNumericSettingValue(
      draft,
      props.setting.min,
      props.setting.max,
      decimalScale === 0,
    );
  const invalid = parse(field.draft) === undefined;
  const errorId = `${id}-error`;
  const descriptionId = props.entry.description
    ? `${id}-description`
    : undefined;
  const describedBy =
    [descriptionId, invalid ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;
  const formatBound = (value: number) =>
    formatSettingNumber(value, i18n.language, props.setting.thousandSeparator);

  return (
    <SettingInputLayout
      invalid={invalid}
      disabled={props.setting.disabled}
      busy={field.busy}
      title={
        <ComponentTitle
          inputId={id}
          descriptionId={descriptionId}
          title={props.entry.uiName}
          description={props.entry.description}
        />
      }
    >
      <NumericFormat
        appearance="settings"
        id={id}
        value={field.draft}
        valueIsNumericString
        thousandSeparator={
          props.setting.thousandSeparator
            ? localeNumberFormat.thousandSeparator
            : false
        }
        decimalSeparator={localeNumberFormat.decimalSeparator}
        allowNegative={props.setting.min < 0}
        decimalScale={decimalScale}
        fixedDecimalScale={
          "fixedDecimalScale" in props.setting &&
          props.setting.fixedDecimalScale
        }
        onValueChange={(values, sourceInfo) => {
          // oxlint-disable-next-line typescript/no-unsafe-enum-comparison -- react-number-format declares SourceType without a runtime export
          if (sourceInfo.source !== "event") return;
          field.edit(values.value, parse(values.value));
        }}
        placeholder={props.entry.placeholder}
        inputMode={decimalScale === 0 ? "numeric" : "decimal"}
        min={props.setting.min}
        max={props.setting.max}
        step={props.setting.step}
        disabled={props.setting.disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onKeyDown={field.onKeyDown}
        onFocusCapture={() => {
          // NumericFormat defers onFocus, so capture the baseline before a change.
          props.onFocus?.();
          field.onFocus();
        }}
        onBlur={field.onBlur}
        customInput={Input}
      />
      {invalid && (
        <FieldError id={errorId}>
          {t("settingsPage.invalidNumberToast.description", {
            min: formatBound(props.setting.min),
            max: formatBound(props.setting.max),
          })}
        </FieldError>
      )}
    </SettingInputLayout>
  );
}

export function MinMaxSettingField(props: {
  setting: MinMaxSetting;
  value: NumericRange;
  changeCallback: (value: NumericRange) => void | Promise<void>;
}) {
  const { t } = useTranslation("common");
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [editor] = useState(() => new NumericRangeEditor(props.value));
  const startEdit = () => {
    editor.startEdit(props.value);
  };
  return (
    <FieldSet className="min-w-0 gap-4">
      <FieldLegend className="sr-only">
        {props.setting.minEntry?.uiName ??
          props.setting.maxEntry?.uiName ??
          t("settingsPage.minMaxLegend")}
      </FieldLegend>
      <FieldGroup className="gap-4">
        <NumericSettingField
          setting={props.setting}
          entry={requireField(props.setting.minEntry, "minEntry")}
          value={props.value.min}
          onFocus={startEdit}
          changeCallback={(value) =>
            editor.save("min", value, props.changeCallback)
          }
        />
        <NumericSettingField
          setting={props.setting}
          entry={requireField(props.setting.maxEntry, "maxEntry")}
          value={props.value.max}
          onFocus={startEdit}
          changeCallback={(value) =>
            editor.save("max", value, props.changeCallback)
          }
        />
      </FieldGroup>
    </FieldSet>
  );
}

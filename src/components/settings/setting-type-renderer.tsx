import type { JsonValue } from "@bufbuild/protobuf";
import { memo, useId } from "react";
import { ComboSettingInput } from "@/components/settings/combo-setting-input.tsx";
import {
  MinMaxSettingField,
  NumericSettingField,
} from "@/components/settings/numeric-setting-field.tsx";
import {
  ComponentTitle,
  SettingInputLayout,
} from "@/components/settings/setting-layout.tsx";
import { StringListSettingField } from "@/components/settings/string-list-setting-field.tsx";
import { StringSettingField } from "@/components/settings/string-setting-field.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import type { SettingsDefinition } from "@/generated/soulfire/common_pb";
import { isNumericRange } from "@/lib/numeric-setting-value.ts";
import { isStringArray } from "@/lib/string-list-entries.ts";

/**
 * Renders a setting type (the UI input component) with its value and change callback.
 * This is a pure presentation component that takes a setting type definition and renders it.
 * It is memoized because each saved value updates the shared config, and
 * re-rendering every field on a keystroke made typing slow on long pages.
 */
export const SettingTypeRenderer = memo(function SettingTypeRenderer(props: {
  settingType: SettingsDefinition["type"];
  value: JsonValue;
  changeCallback: (value: JsonValue) => void | Promise<void>;
  /** A toggle or option change is still saving. */
  pending?: boolean | undefined;
}) {
  const inputId = useId();
  const descriptionId =
    props.settingType.case !== undefined &&
    props.settingType.case !== "minMax" &&
    props.settingType.value.description
      ? `${inputId}-description`
      : undefined;
  switch (props.settingType.case) {
    case "string": {
      return (
        <StringSettingField
          setting={props.settingType.value}
          value={typeof props.value === "string" ? props.value : ""}
          changeCallback={props.changeCallback}
        />
      );
    }
    case "int":
    case "double": {
      return (
        <NumericSettingField
          setting={props.settingType.value}
          entry={props.settingType.value}
          value={typeof props.value === "number" ? props.value : 0}
          changeCallback={props.changeCallback}
        />
      );
    }
    case "bool": {
      const setting = props.settingType.value;
      return (
        <Field
          orientation="horizontal"
          className="max-w-3xl"
          data-disabled={setting.disabled}
        >
          <FieldContent>
            <FieldLabel htmlFor={inputId}>{setting.uiName}</FieldLabel>
            {setting.description && (
              <FieldDescription id={descriptionId}>
                {setting.description}
              </FieldDescription>
            )}
          </FieldContent>
          <Switch
            id={inputId}
            aria-describedby={descriptionId}
            checked={props.value === true}
            aria-busy={props.pending || undefined}
            disabled={setting.disabled}
            onCheckedChange={(value) => void props.changeCallback(value)}
          />
        </Field>
      );
    }
    case "combo": {
      return (
        <SettingInputLayout
          disabled={props.settingType.value.disabled}
          title={
            <ComponentTitle
              inputId={inputId}
              descriptionId={descriptionId}
              title={props.settingType.value.uiName}
              description={props.settingType.value.description}
            />
          }
        >
          <ComboSettingInput
            id={inputId}
            describedBy={descriptionId}
            setting={props.settingType.value}
            value={typeof props.value === "string" ? props.value : ""}
            pending={props.pending}
            changeCallback={(value) => void props.changeCallback(value)}
          />
        </SettingInputLayout>
      );
    }
    case "stringList": {
      return (
        <StringListSettingField
          setting={props.settingType.value}
          value={isStringArray(props.value) ? props.value : []}
          changeCallback={props.changeCallback}
        />
      );
    }
    case "minMax": {
      return (
        <MinMaxSettingField
          setting={props.settingType.value}
          value={isNumericRange(props.value) ? props.value : { min: 0, max: 0 }}
          changeCallback={props.changeCallback}
        />
      );
    }
    case undefined: {
      return null;
    }
    default: {
      return props.settingType satisfies never;
    }
  }
});

import type { ChangeEvent, HTMLInputTypeAttribute } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  ComponentTitle,
  SettingInputLayout,
} from "@/components/settings/setting-layout.tsx";
import { useSettingDraft } from "@/components/settings/use-setting-draft.ts";
import { FieldError } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  type StringSetting,
  StringSetting_InputType,
} from "@/generated/soulfire/common_pb";
import { getStringSettingError } from "@/lib/setting-string-validity.ts";

function inputTypeToHtml(
  inputType: Exclude<StringSetting_InputType, StringSetting_InputType.TEXTAREA>,
): HTMLInputTypeAttribute {
  switch (inputType) {
    case StringSetting_InputType.TEXT: {
      return "text";
    }
    case StringSetting_InputType.PASSWORD: {
      return "password";
    }
    case StringSetting_InputType.EMAIL: {
      return "email";
    }
    case StringSetting_InputType.URL: {
      return "url";
    }
    case StringSetting_InputType.SEARCH: {
      return "search";
    }
    case StringSetting_InputType.TEL: {
      return "tel";
    }
    default: {
      return inputType satisfies never;
    }
  }
}

export function StringSettingField(props: {
  setting: StringSetting;
  value: string;
  changeCallback: (value: string) => void | Promise<void>;
}) {
  const { t } = useTranslation("validation");
  const id = useId();
  const { setting } = props;
  const textarea = setting.inputType === StringSetting_InputType.TEXTAREA;
  const constraints = {
    type:
      setting.inputType === StringSetting_InputType.EMAIL
        ? "email"
        : setting.inputType === StringSetting_InputType.URL
          ? "url"
          : "other",
    minLength: setting.minLength,
    // A text area has no pattern attribute, so the browser does not check one.
    pattern: textarea ? "" : setting.pattern,
  } as const;
  const field = useSettingDraft<string, string>({
    value: props.value,
    commit: props.changeCallback,
  });
  const error = getStringSettingError(field.draft, constraints);
  const errorId = `${id}-error`;
  const descriptionId = setting.description ? `${id}-description` : undefined;
  const describedBy =
    [descriptionId, error ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;
  const onChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = event.currentTarget.value;
    field.edit(
      value,
      getStringSettingError(value, constraints) ? undefined : value,
    );
  };
  const shared = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error !== undefined,
    value: field.draft,
    placeholder: setting.placeholder,
    minLength: setting.minLength,
    maxLength: setting.maxLength,
    disabled: setting.disabled,
    onChange,
    onFocus: field.onFocus,
    onBlur: field.onBlur,
  };

  return (
    <SettingInputLayout
      invalid={error !== undefined}
      disabled={setting.disabled}
      busy={field.busy}
      title={
        <ComponentTitle
          inputId={id}
          descriptionId={descriptionId}
          title={setting.uiName}
          description={setting.description}
        />
      }
    >
      {setting.inputType === StringSetting_InputType.TEXTAREA ? (
        <Textarea {...shared} />
      ) : (
        <Input
          {...shared}
          appearance="settings"
          type={inputTypeToHtml(setting.inputType)}
          pattern={setting.pattern}
          onKeyDown={field.onKeyDown}
        />
      )}
      {error && (
        <FieldError id={errorId}>
          {error === "minLength"
            ? t("minLength", { count: setting.minLength })
            : t(error)}
        </FieldError>
      )}
    </SettingInputLayout>
  );
}

import type { JsonValue } from "@bufbuild/protobuf";
import {
  type BoolSetting,
  type ComboSetting,
  type DoubleSetting,
  type IntSetting,
  type MinMaxSetting,
  type MinMaxSetting_Entry,
  type SettingsDefinition,
  type SettingsEntryIdentifier,
  type SettingsPage,
  type StringListSetting,
  type StringSetting,
  StringSetting_InputType,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Check, ChevronsUpDown, PlusIcon, TrashIcon } from "lucide-react";
import {
  type ChangeEvent,
  type HTMLInputTypeAttribute,
  type ReactNode,
  use,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { NumericFormat } from "react-number-format";
import type { NumberFormatValues } from "react-number-format/types/types";
import { toast } from "sonner";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { TextInfoButton } from "@/components/info-buttons.tsx";
import {
  createSettingsRegistry,
  SettingsRegistryContext,
  useSettingsDefinition,
  useSettingsDefinitionByKey,
} from "@/components/providers/settings-registry-context.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import {
  Field,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useCachedState } from "@/hooks/use-cached-state.ts";
import { useLocaleNumberFormat } from "@/hooks/use-locale-number-format.tsx";
import type { BaseSettings } from "@/lib/types.ts";
import {
  cn,
  getSettingIdentifierKey,
  getSettingValue,
  updateBotConfigEntry,
  updateInstanceConfigEntry,
  updateServerConfigEntry,
} from "@/lib/utils.tsx";

function isAllowedValidator(
  t: TFunction,
  min: number,
  max: number,
  parseFunc: (value: string) => number,
) {
  return (values: NumberFormatValues) => {
    const currentValue = parseFunc(values.value);

    if (!Number.isFinite(currentValue)) {
      return false;
    }

    if (currentValue >= min && currentValue <= max) {
      return true;
    } else {
      toast.warning(t("settingsPage.invalidNumberToast.title"), {
        id: "invalid-number",
        description: t("settingsPage.invalidNumberToast.title", {
          min,
          max,
        }),
      });
      return false;
    }
  };
}

export function ComponentTitle(props: {
  title: ReactNode;
  description: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="flex w-fit flex-row items-center gap-2">
      <p
        onClick={props.onClick}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && props.onClick) {
            e.preventDefault();
            props.onClick();
          }
        }}
        tabIndex={props.onClick ? 0 : undefined}
        className={cn({
          "cursor-pointer": props.onClick !== undefined,
        })}
      >
        {props.title}
      </p>
      <TextInfoButton value={props.description} />
    </div>
  );
}

function inputTypeToHtml(
  inputType: Exclude<StringSetting_InputType, StringSetting_InputType.TEXTAREA>,
): HTMLInputTypeAttribute {
  switch (inputType) {
    case StringSetting_InputType.TEXT:
      return "text";
    case StringSetting_InputType.PASSWORD:
      return "password";
    case StringSetting_InputType.EMAIL:
      return "email";
    case StringSetting_InputType.URL:
      return "url";
    case StringSetting_InputType.SEARCH:
      return "search";
    case StringSetting_InputType.TEL:
      return "tel";
  }
}

function StringComponent(props: {
  setting: StringSetting;
  value: string;
  changeCallback: (value: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useCachedState(props.value, {
    shouldSync: !isFocused,
  });

  const onChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const newValue = e.currentTarget.value;
    setInputValue(newValue);
    props.changeCallback(newValue);
  };

  if (props.setting.inputType === StringSetting_InputType.TEXTAREA) {
    return (
      <Textarea
        value={inputValue}
        placeholder={props.setting.placeholder}
        minLength={props.setting.minLength}
        maxLength={props.setting.maxLength}
        disabled={props.setting.disabled}
        onChange={onChangeHandler}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    );
  } else {
    return (
      <Input
        value={inputValue}
        type={inputTypeToHtml(props.setting.inputType)}
        placeholder={props.setting.placeholder}
        minLength={props.setting.minLength}
        maxLength={props.setting.maxLength}
        pattern={props.setting.pattern}
        disabled={props.setting.disabled}
        onChange={onChangeHandler}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    );
  }
}

function IntComponent(props: {
  setting: IntSetting;
  value: number;
  changeCallback: (value: number) => void;
}) {
  const { t } = useTranslation("common");
  const localeNumberFormat = useLocaleNumberFormat();
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useCachedState(props.value, {
    shouldSync: !isFocused,
  });

  return (
    <NumericFormat
      value={inputValue}
      thousandSeparator={
        props.setting.thousandSeparator
          ? localeNumberFormat.thousandSeparator
          : undefined
      }
      decimalSeparator={localeNumberFormat.decimalSeparator}
      allowNegative={props.setting.min < 0}
      decimalScale={0}
      isAllowed={isAllowedValidator(
        t,
        props.setting.min,
        props.setting.max,
        parseInt,
      )}
      onValueChange={(values) => {
        const currentValue = parseInt(values.value, 10);

        if (!Number.isFinite(currentValue)) {
          return;
        }

        setInputValue(currentValue);
        props.changeCallback(currentValue);
      }}
      placeholder={props.setting.placeholder}
      inputMode="numeric"
      min={props.setting.min}
      max={props.setting.max}
      step={props.setting.step}
      disabled={props.setting.disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      customInput={Input}
    />
  );
}

function DoubleComponent(props: {
  setting: DoubleSetting;
  value: number;
  changeCallback: (value: number) => void;
}) {
  const { t } = useTranslation("common");
  const localeNumberFormat = useLocaleNumberFormat();
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useCachedState(props.value, {
    shouldSync: !isFocused,
  });

  return (
    <NumericFormat
      value={inputValue}
      thousandSeparator={
        props.setting.thousandSeparator
          ? localeNumberFormat.thousandSeparator
          : undefined
      }
      decimalSeparator={localeNumberFormat.decimalSeparator}
      allowNegative={props.setting.min < 0}
      decimalScale={props.setting.decimalScale}
      fixedDecimalScale={props.setting.fixedDecimalScale}
      isAllowed={isAllowedValidator(
        t,
        props.setting.min,
        props.setting.max,
        parseFloat,
      )}
      onValueChange={(values) => {
        const currentValue = parseFloat(values.value);

        if (!Number.isFinite(currentValue)) {
          return;
        }

        setInputValue(currentValue);
        props.changeCallback(currentValue);
      }}
      placeholder={props.setting.placeholder}
      inputMode="decimal"
      min={props.setting.min}
      max={props.setting.max}
      step={props.setting.step}
      disabled={props.setting.disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      customInput={Input}
    />
  );
}

function BoolComponent(props: {
  setting: BoolSetting;
  value: boolean;
  changeCallback: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <>
      <Checkbox
        className="my-auto"
        checked={props.value}
        disabled={props.setting.disabled}
        onCheckedChange={(value) => {
          props.changeCallback(value);
        }}
      />
      <ComponentTitle
        title={props.title}
        description={props.description}
        onClick={
          props.setting.disabled
            ? undefined
            : () => {
                props.changeCallback(!props.value);
              }
        }
      />
    </>
  );
}

function ComboComponent(props: {
  setting: ComboSetting;
  value: string;
  changeCallback: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const selectedOption =
    props.setting.options.find((option) => option.id === props.value) ??
    props.setting.options[0];
  if (selectedOption.id !== props.value) {
    props.changeCallback(selectedOption.id);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-72 justify-between"
            disabled={props.setting.disabled}
          />
        }
      >
        <div className="inline-flex flex-row items-center justify-center gap-2">
          {selectedOption.iconId && (
            <DynamicIcon name={selectedOption.iconId} />
          )}
          <span className="truncate">{selectedOption.displayName}</span>
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <Command>
          <CommandInput
            placeholder={t("settingsPage.combo.searchPlaceholder")}
          />
          <CommandList>
            <CommandGroup>
              {props.setting.options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  keywords={[option.displayName, ...option.keywords]}
                  onSelect={(currentValue) => {
                    props.changeCallback(currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      props.value === option.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.iconId && <DynamicIcon name={option.iconId} />}
                  {option.displayName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type IdValue<T> = { id: string; value: T };

function makeIdValueArray<T>(values: T[]): IdValue<T>[] {
  return values.map((value) => makeIdValueSingle(value));
}

function makeIdValueSingle<T>(value: T): IdValue<T> {
  const randomId = Math.random().toString(36).substring(7);
  return { id: randomId, value };
}

function StringListComponent(props: {
  setting: StringListSetting;
  value: string[];
  changeCallback: (value: string[]) => void;
}) {
  const { t } = useTranslation("common");
  const idValueArray = useMemo(
    () => makeIdValueArray(props.value),
    [props.value],
  );
  const [newEntryInput, setNewEntryInput] = useState("");

  const insertValue = (newValue: string) => {
    const resultArray = [...idValueArray, makeIdValueSingle(newValue)];
    props.changeCallback(resultArray.map((i) => i.value));
  };
  const updateId = (id: string, newValue: string) => {
    const resultArray = [...idValueArray];
    const index = resultArray.findIndex((item) => item.id === id);
    resultArray[index] = { id, value: newValue };
    props.changeCallback(resultArray.map((i) => i.value));
  };
  const deleteId = (id: string) => {
    const resultArray = [...idValueArray];
    const index = resultArray.findIndex((item) => item.id === id);
    resultArray.splice(index, 1);
    props.changeCallback(resultArray.map((i) => i.value));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <InputGroup>
          <InputGroupInput
            type="text"
            value={newEntryInput}
            onChange={(e) => {
              setNewEntryInput(e.currentTarget.value);
            }}
            placeholder={t("settingsPage.stringList.placeholder")}
            disabled={props.setting.disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                insertValue(newEntryInput);
                setNewEntryInput("");
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => {
                insertValue(newEntryInput);
                setNewEntryInput("");
              }}
              disabled={props.setting.disabled}
            >
              <PlusIcon />
              {t("settingsPage.stringList.add")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {idValueArray.map((item) => (
          <InputGroup key={item.id}>
            <InputGroupInput
              type="text"
              defaultValue={item.value}
              onChange={(e) => {
                updateId(item.id, e.currentTarget.value);
              }}
              disabled={props.setting.disabled}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={() => {
                  deleteId(item.id);
                }}
                disabled={props.setting.disabled}
              >
                <TrashIcon />
                {t("settingsPage.stringList.remove")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ))}
      </CardContent>
    </Card>
  );
}

function MinMaxComponent(props: {
  setting: MinMaxSetting;
  entry: MinMaxSetting_Entry;
  value: number;
  changeCallback: (value: number) => void;
}) {
  const { t } = useTranslation("common");
  const localeNumberFormat = useLocaleNumberFormat();
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue] = useCachedState(props.value, {
    shouldSync: !isFocused,
  });

  return (
    <NumericFormat
      value={inputValue}
      thousandSeparator={
        props.setting.thousandSeparator
          ? localeNumberFormat.thousandSeparator
          : undefined
      }
      decimalSeparator={localeNumberFormat.decimalSeparator}
      allowNegative={props.setting.min < 0}
      decimalScale={0}
      isAllowed={isAllowedValidator(
        t,
        props.setting.min,
        props.setting.max,
        parseInt,
      )}
      onValueChange={(values) => {
        const currentValue = parseInt(values.value, 10);

        if (!Number.isFinite(currentValue)) {
          return;
        }

        props.changeCallback(currentValue);
      }}
      placeholder={props.entry.placeholder}
      disabled={props.setting.disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      inputMode="numeric"
      min={props.setting.min}
      max={props.setting.max}
      step={props.setting.step}
      customInput={Input}
    />
  );
}

/**
 * Renders a setting type (the UI input component) with its value and change callback.
 * This is a pure presentation component that takes a setting type definition and renders it.
 */
export function SettingTypeRenderer(props: {
  settingType: SettingsDefinition["type"];
  value: JsonValue;
  changeCallback: (value: JsonValue) => void;
}) {
  if (!props.settingType || props.value === undefined) {
    return null;
  }

  switch (props.settingType.case) {
    case "string": {
      return (
        <Field className="max-w-xl">
          <ComponentTitle
            title={props.settingType.value.uiName}
            description={props.settingType.value.description}
          />
          <StringComponent
            setting={props.settingType.value}
            value={props.value as string}
            changeCallback={props.changeCallback}
          />
        </Field>
      );
    }
    case "int": {
      return (
        <Field className="max-w-xl">
          <ComponentTitle
            title={props.settingType.value.uiName}
            description={props.settingType.value.description}
          />
          <IntComponent
            setting={props.settingType.value}
            value={props.value as number}
            changeCallback={props.changeCallback}
          />
        </Field>
      );
    }
    case "bool": {
      return (
        <Field orientation="horizontal" className="max-w-xl items-start">
          <BoolComponent
            setting={props.settingType.value}
            value={props.value as boolean}
            changeCallback={props.changeCallback}
            title={props.settingType.value.uiName}
            description={props.settingType.value.description}
          />
        </Field>
      );
    }
    case "double": {
      return (
        <Field className="max-w-xl">
          <ComponentTitle
            title={props.settingType.value.uiName}
            description={props.settingType.value.description}
          />
          <DoubleComponent
            setting={props.settingType.value}
            value={props.value as number}
            changeCallback={props.changeCallback}
          />
        </Field>
      );
    }
    case "combo": {
      return (
        <Field className="max-w-xl">
          <ComponentTitle
            title={props.settingType.value.uiName}
            description={props.settingType.value.description}
          />
          <ComboComponent
            setting={props.settingType.value}
            value={props.value as string}
            changeCallback={props.changeCallback}
          />
        </Field>
      );
    }
    case "stringList": {
      return (
        <Field className="max-w-xl">
          <ComponentTitle
            title={props.settingType.value.uiName}
            description={props.settingType.value.description}
          />
          <StringListComponent
            setting={props.settingType.value}
            value={props.value as string[]}
            changeCallback={props.changeCallback}
          />
        </Field>
      );
    }
    case "minMax": {
      const castValue = props.value as {
        min: number;
        max: number;
      };
      return (
        <FieldSet className="max-w-xl gap-4">
          <FieldLegend className="sr-only">
            {props.settingType.value.minEntry?.uiName ??
              props.settingType.value.maxEntry?.uiName ??
              "Minimum and maximum settings"}
          </FieldLegend>
          <FieldGroup className="gap-4">
            <Field>
              <ComponentTitle
                title={props.settingType.value.minEntry?.uiName}
                description={props.settingType.value.minEntry?.description}
              />
              <MinMaxComponent
                setting={props.settingType.value}
                entry={props.settingType.value.minEntry as MinMaxSetting_Entry}
                value={castValue.min}
                changeCallback={(v) => {
                  props.changeCallback({
                    max: Math.max(castValue.max, v),
                    min: v,
                  });
                }}
              />
            </Field>
            <Field>
              <ComponentTitle
                title={props.settingType.value.maxEntry?.uiName}
                description={props.settingType.value.maxEntry?.description}
              />
              <MinMaxComponent
                setting={props.settingType.value}
                entry={props.settingType.value.maxEntry as MinMaxSetting_Entry}
                value={castValue.max}
                changeCallback={(v) => {
                  props.changeCallback({
                    max: v,
                    min: Math.min(castValue.min, v),
                  });
                }}
              />
            </Field>
          </FieldGroup>
        </FieldSet>
      );
    }
  }
}

/**
 * Component that renders a setting field by its identifier.
 * This is the main component for mounting settings anywhere in the UI.
 * It looks up the setting definition from context and handles value management.
 */
function SettingField<T extends BaseSettings>(props: {
  settingId: SettingsEntryIdentifier;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: T;
}) {
  const definition = useSettingsDefinition(props.settingId);
  const namespace = props.settingId.namespace;
  const key = props.settingId.key;
  const value = useMemo(
    () => getSettingValue(props.config, definition),
    [props.config, definition],
  );
  const setValueMutation = useMutation({
    mutationKey: ["setting", namespace, key],
    scope: { id: `setting-${namespace}-${key}` },
    mutationFn: async (value: JsonValue) => {
      await props.updateConfigEntry(namespace, key, value);
    },
    onSettled: async () => {
      await props.invalidateQuery();
    },
  });

  if (!definition) {
    return null;
  }

  return (
    <SettingTypeRenderer
      settingType={definition.type}
      value={value}
      changeCallback={setValueMutation.mutate}
    />
  );
}

export function InstanceSettingFieldByKey<T extends BaseSettings>(props: {
  namespace: string;
  settingKey: string;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: T;
}) {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(instanceInfo.settingsDefinitions),
    [instanceInfo.settingsDefinitions],
  );

  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <SettingFieldByKey {...props} />
    </SettingsRegistryContext.Provider>
  );
}

/**
 * Component that renders a setting field by namespace and key strings.
 * Convenience wrapper around SettingField for when you have separate strings.
 */
function SettingFieldByKey<T extends BaseSettings>(props: {
  namespace: string;
  settingKey: string;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: T;
}) {
  const definition = useSettingsDefinitionByKey(
    props.namespace,
    props.settingKey,
  );
  const value = useMemo(
    () => getSettingValue(props.config, definition),
    [props.config, definition],
  );
  const setValueMutation = useMutation({
    mutationKey: ["setting", props.namespace, props.settingKey],
    scope: { id: `setting-${props.namespace}-${props.settingKey}` },
    mutationFn: async (value: JsonValue) => {
      await props.updateConfigEntry(props.namespace, props.settingKey, value);
    },
    onSettled: async () => {
      await props.invalidateQuery();
    },
  });

  if (!definition) {
    return null;
  }

  return (
    <SettingTypeRenderer
      settingType={definition.type}
      value={value}
      changeCallback={setValueMutation.mutate}
    />
  );
}

export type DisabledSettingId = {
  namespace: string;
  key: string;
};

function ClientSettingsPageComponent<T extends BaseSettings>({
  data,
  invalidateQuery,
  updateConfigEntry,
  config,
  disabledIds = [],
}: {
  data: SettingsPage;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: T;
  disabledIds?: DisabledSettingId[];
}) {
  const enabledIdentifier = data.enabledIdentifier;
  const allDisabledIds = useMemo(() => {
    const result = [...disabledIds];
    if (enabledIdentifier) {
      result.push(enabledIdentifier);
    }
    return result;
  }, [disabledIds, enabledIdentifier]);

  return (
    <>
      {data.entries
        .filter(
          (entryId) =>
            !allDisabledIds.some(
              (id) =>
                entryId.namespace === id.namespace && entryId.key === id.key,
            ),
        )
        .map((entryId) => (
          <SettingField
            key={getSettingIdentifierKey(entryId)}
            settingId={entryId}
            updateConfigEntry={updateConfigEntry}
            invalidateQuery={invalidateQuery}
            config={config}
          />
        ))}
    </>
  );
}

export function InstanceSettingsPageComponent({
  data,
  disabledIds,
}: {
  data: SettingsPage;
  disabledIds?: DisabledSettingId[];
}) {
  const queryClient = useQueryClient();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const transport = use(TransportContext);
  const profile = instanceInfo.profile;
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(instanceInfo.settingsDefinitions),
    [instanceInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        data={data}
        updateConfigEntry={async (namespace, key, value) =>
          await updateInstanceConfigEntry(
            namespace,
            key,
            value,
            instanceInfo,
            transport,
            queryClient,
            instanceInfoQueryOptions.queryKey,
          )
        }
        invalidateQuery={async () => {
          await queryClient.invalidateQueries({
            queryKey: instanceInfoQueryOptions.queryKey,
          });
        }}
        config={profile}
        disabledIds={disabledIds}
      />
    </SettingsRegistryContext.Provider>
  );
}

export function AdminSettingsPageComponent({ data }: { data: SettingsPage }) {
  const queryClient = useQueryClient();
  const serverInfoQueryOptions = useRouteContext({
    from: "/_dashboard/user/admin",
    select: (context) => context.serverInfoQueryOptions,
  });
  const { data: serverInfo } = useSuspenseQuery(serverInfoQueryOptions);
  const serverConfig = serverInfo.profile;
  const transport = use(TransportContext);
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(serverInfo.settingsDefinitions),
    [serverInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        data={data}
        updateConfigEntry={async (namespace, key, value) =>
          await updateServerConfigEntry(
            namespace,
            key,
            value,
            transport,
            queryClient,
            serverInfoQueryOptions.queryKey,
          )
        }
        invalidateQuery={async () => {
          await queryClient.invalidateQueries({
            queryKey: serverInfoQueryOptions.queryKey,
          });
        }}
        config={serverConfig}
      />
    </SettingsRegistryContext.Provider>
  );
}

export function BotSettingsPageComponent({
  data,
  botConfig,
  botId,
}: {
  data: SettingsPage;
  botConfig: BaseSettings;
  botId: string;
}) {
  const queryClient = useQueryClient();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const transport = use(TransportContext);
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(instanceInfo.settingsDefinitions),
    [instanceInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        data={data}
        updateConfigEntry={async (namespace, key, value) =>
          await updateBotConfigEntry(
            namespace,
            key,
            value,
            instanceInfo.id,
            botId,
            transport,
            queryClient,
            instanceInfoQueryOptions.queryKey,
          )
        }
        invalidateQuery={async () => {
          await queryClient.invalidateQueries({
            queryKey: instanceInfoQueryOptions.queryKey,
          });
        }}
        config={botConfig}
      />
    </SettingsRegistryContext.Provider>
  );
}

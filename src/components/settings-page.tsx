import type { JsonValue } from "@bufbuild/protobuf";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  Check,
  CheckIcon,
  ChevronRightIcon,
  ChevronsUpDown,
  CircleAlertIcon,
  InfoIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type HTMLInputTypeAttribute,
  type ReactNode,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { NumericFormat } from "react-number-format";
import { toast } from "sonner";
import { useCommandPalette } from "@/components/command-palette-context.ts";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import {
  createSettingsRegistry,
  SettingsRegistryContext,
  useSettingsDefinition,
  useSettingsDefinitionByKey,
} from "@/components/providers/settings-registry-context.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import {
  Field,
  FieldDescription,
  FieldContent,
  FieldError,
  FieldLabel,
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
import { Switch } from "@/components/ui/switch.tsx";
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
} from "@/generated/soulfire/common_pb";
import { useCachedState } from "@/hooks/use-cached-state.ts";
import { useSettingSaveError } from "@/hooks/use-setting-save-error.ts";
import { useLocaleNumberFormat } from "@/hooks/use-locale-number-format.tsx";
import {
  createStringListEntry,
  reconcileStringListEntries,
  type StringListEntry,
} from "@/lib/string-list-entries.ts";
import { NumericRangeEditor } from "@/lib/numeric-range-editor.ts";
import {
  focusSettingElement,
  getSettingLabel,
  isFocusedSetting,
  type SettingFocus,
} from "@/lib/settings-focus";
import {
  getNumericSettingValue,
  type NumericRange,
} from "@/lib/numeric-setting-value.ts";
import {
  settingMutationOptions,
  type SettingMutationTarget,
} from "@/lib/setting-mutation-options.ts";
import {
  filterSettingsEntries,
  findSettingsOnOtherPages,
  splitSettingsEntries,
  groupSettingsEntries,
} from "@/lib/settings-discovery.ts";
import type { BaseSettings } from "@/lib/types.ts";
import {
  cn,
  getSettingValue,
  updateBotConfigEntry,
  updateInstanceConfigEntry,
  updateServerConfigEntry,
} from "@/lib/utils.tsx";

function SettingInputLayout(props: {
  title: ReactNode;
  children: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Field
      className="min-w-0 max-w-3xl"
      data-invalid={props.invalid}
      data-disabled={props.disabled}
      aria-busy={props.busy}
    >
      {props.title}
      <div className="flex min-w-0 flex-col gap-2">{props.children}</div>
    </Field>
  );
}

export function ComponentTitle(props: {
  title: ReactNode;
  description: ReactNode;
  inputId?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {props.inputId ? (
        <FieldLabel htmlFor={props.inputId}>{props.title}</FieldLabel>
      ) : (
        <p className="text-sm font-medium">{props.title}</p>
      )}
      {props.description && (
        <FieldDescription>{props.description}</FieldDescription>
      )}
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
  id: string;
  setting: StringSetting;
  value: string;
  changeCallback: (value: string) => void | Promise<void>;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [inputValue, setInputValue] = useCachedState(props.value, {
    shouldSync: !isFocused && pendingWrites === 0,
  });

  const onChangeHandler = async (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const newValue = e.currentTarget.value;
    setInputValue(newValue);
    setPendingWrites((count) => count + 1);
    try {
      await props.changeCallback(newValue);
    } catch {
      // The mutation reports the failure and reloads the stored value.
    } finally {
      setPendingWrites((count) => count - 1);
    }
  };

  if (props.setting.inputType === StringSetting_InputType.TEXTAREA) {
    return (
      <Textarea
        id={props.id}
        aria-label={props.setting.uiName}
        aria-busy={pendingWrites > 0}
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
        id={props.id}
        appearance="settings"
        aria-label={props.setting.uiName}
        aria-busy={pendingWrites > 0}
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

function NumericSettingField(props: {
  setting: IntSetting | DoubleSetting | MinMaxSetting;
  entry: Pick<IntSetting, "uiName" | "description" | "placeholder">;
  value: number;
  changeCallback: (value: number) => void | Promise<void>;
  onFocus?: () => void;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const localeNumberFormat = useLocaleNumberFormat();
  const [isFocused, setIsFocused] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [draft, setDraft] = useCachedState<string | number>(props.value, {
    shouldSync: !isFocused && pendingWrites === 0,
  });
  const decimalScale =
    "decimalScale" in props.setting ? props.setting.decimalScale : 0;
  const invalid =
    getNumericSettingValue(
      draft,
      props.setting.min,
      props.setting.max,
      decimalScale === 0,
    ) === undefined;
  const errorId = `${id}-error`;
  const saveValue = async (value: number) => {
    setPendingWrites((count) => count + 1);
    try {
      await props.changeCallback(value);
    } catch {
      // The mutation reports the failure and reloads the stored value.
    } finally {
      setPendingWrites((count) => count - 1);
    }
  };

  return (
    <SettingInputLayout
      invalid={invalid}
      disabled={props.setting.disabled}
      busy={pendingWrites > 0}
      title={
        <ComponentTitle
          inputId={id}
          title={props.entry.uiName}
          description={props.entry.description}
        />
      }
    >
      <NumericFormat
        appearance="settings"
        id={id}
        value={draft}
        valueIsNumericString
        thousandSeparator={
          props.setting.thousandSeparator
            ? localeNumberFormat.thousandSeparator
            : undefined
        }
        decimalSeparator={localeNumberFormat.decimalSeparator}
        allowNegative={props.setting.min < 0}
        decimalScale={decimalScale}
        fixedDecimalScale={
          "fixedDecimalScale" in props.setting &&
          props.setting.fixedDecimalScale
        }
        onValueChange={(values, sourceInfo) => {
          if (sourceInfo.source !== "event") return;
          setDraft(values.value);
          const value = getNumericSettingValue(
            values.value,
            props.setting.min,
            props.setting.max,
            decimalScale === 0,
          );
          if (value !== undefined) void saveValue(value);
        }}
        placeholder={props.entry.placeholder}
        inputMode={decimalScale === 0 ? "numeric" : "decimal"}
        min={props.setting.min}
        max={props.setting.max}
        step={props.setting.step}
        disabled={props.setting.disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onFocusCapture={() => {
          // NumericFormat defers onFocus, so capture the baseline before a change.
          props.onFocus?.();
          setIsFocused(true);
        }}
        onBlur={() => setIsFocused(false)}
        customInput={Input}
      />
      {invalid && (
        <FieldError id={errorId}>
          {t("settingsPage.invalidNumberToast.description", {
            min: props.setting.min,
            max: props.setting.max,
          })}
        </FieldError>
      )}
    </SettingInputLayout>
  );
}

function MinMaxSettingField(props: {
  setting: MinMaxSetting;
  value: NumericRange;
  changeCallback: (value: NumericRange) => void | Promise<void>;
}) {
  const [editor] = useState(() => new NumericRangeEditor(props.value));
  const startEdit = () => editor.startEdit(props.value);
  return (
    <FieldSet className="min-w-0 gap-4">
      <FieldLegend className="sr-only">
        {props.setting.minEntry?.uiName ??
          props.setting.maxEntry?.uiName ??
          "Minimum and maximum settings"}
      </FieldLegend>
      <FieldGroup className="gap-4">
        <NumericSettingField
          setting={props.setting}
          entry={props.setting.minEntry as MinMaxSetting_Entry}
          value={props.value.min}
          onFocus={startEdit}
          changeCallback={(value) =>
            editor.save("min", value, props.changeCallback)
          }
        />
        <NumericSettingField
          setting={props.setting}
          entry={props.setting.maxEntry as MinMaxSetting_Entry}
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

function BoolComponent(props: {
  setting: BoolSetting;
  value: boolean;
  changeCallback: (value: boolean) => void;
  title: string;
  description: string;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  return (
    <>
      <FieldContent>
        <FieldLabel htmlFor={id}>{props.title}</FieldLabel>
        {props.description && (
          <FieldDescription id={`${id}-description`}>
            {props.description}
          </FieldDescription>
        )}
      </FieldContent>
      <div>
        <div className="bg-muted/50 inline-flex items-center gap-3 rounded-md border px-3 py-2">
          <span className="text-sm">
            {t(props.value ? "pluginCard.enabled" : "pluginCard.disabled")}
          </span>
          <Switch
            id={id}
            aria-describedby={
              props.description ? `${id}-description` : undefined
            }
            checked={props.value}
            disabled={props.setting.disabled}
            onCheckedChange={props.changeCallback}
          />
        </div>
      </div>
    </>
  );
}

function ComboComponent(props: {
  id: string;
  setting: ComboSetting;
  value: string;
  changeCallback: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const selectedOption = props.setting.options.find(
    (option) => option.id === props.value,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={props.id}
            variant="outline"
            role="combobox"
            aria-label={props.setting.uiName}
            aria-expanded={open}
            className="w-full justify-between"
            disabled={
              props.setting.disabled || props.setting.options.length === 0
            }
          />
        }
      >
        <div className="inline-flex min-w-0 flex-row items-center gap-2">
          {selectedOption?.iconId && (
            <DynamicIcon name={selectedOption.iconId} />
          )}
          <span className="truncate">
            {selectedOption?.displayName ??
              t("settingsPage.combo.selectPlaceholder")}
          </span>
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        aria-label={props.setting.uiName}
        className="w-(--anchor-width) p-0"
      >
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

function StringListComponent(props: {
  setting: StringListSetting;
  value: string[];
  changeCallback: (value: string[]) => void | Promise<void>;
}) {
  const { t } = useTranslation("common");
  const [list, setList] = useState<{
    entries: StringListEntry[];
    source: string[] | undefined;
    pending: number;
  }>(() => ({
    entries: props.value.map(createStringListEntry),
    source: props.value,
    pending: 0,
  }));
  if (list.pending === 0 && list.source !== props.value) {
    setList({
      ...list,
      entries: reconcileStringListEntries(list.entries, props.value),
      source: props.value,
    });
  }
  const [newEntryInput, setNewEntryInput] = useState("");
  const draftRevision = useRef(0);

  const saveEntries = async (entries: StringListEntry[]) => {
    setList((current) => ({
      entries,
      source: undefined,
      pending: current.pending + 1,
    }));
    try {
      await props.changeCallback(entries.map((entry) => entry.value));
      return true;
    } catch {
      toast.error(
        t("settingsPage.stringList.saveError", {
          name: props.setting.uiName,
        }),
      );
      return false;
    } finally {
      setList((current) => ({ ...current, pending: current.pending - 1 }));
    }
  };
  const insertValue = async (value: string) => {
    const revision = ++draftRevision.current;
    setNewEntryInput("");
    const saved = await saveEntries([
      ...list.entries,
      createStringListEntry(value),
    ]);
    if (!saved && draftRevision.current === revision) {
      setNewEntryInput(value);
    }
  };
  const updateId = (id: string, value: string) => {
    void saveEntries(
      list.entries.map((entry) =>
        entry.id === id ? { ...entry, value } : entry,
      ),
    );
  };
  const deleteId = (id: string) => {
    void saveEntries(list.entries.filter((entry) => entry.id !== id));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <InputGroup>
          <InputGroupInput
            type="text"
            value={newEntryInput}
            aria-label={t("settingsPage.stringList.newEntry", {
              name: props.setting.uiName,
            })}
            onChange={(e) => {
              draftRevision.current++;
              setNewEntryInput(e.currentTarget.value);
            }}
            placeholder={t("settingsPage.stringList.placeholder")}
            disabled={props.setting.disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void insertValue(newEntryInput);
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => {
                void insertValue(newEntryInput);
              }}
              disabled={props.setting.disabled}
            >
              <PlusIcon />
              {t("settingsPage.stringList.add")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {list.entries.map((item, index) => (
          <InputGroup key={item.id}>
            <InputGroupInput
              type="text"
              value={item.value}
              aria-label={t("settingsPage.stringList.entry", {
                name: props.setting.uiName,
                number: index + 1,
              })}
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
                aria-label={t("settingsPage.stringList.removeEntry", {
                  name: props.setting.uiName,
                  number: index + 1,
                })}
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

/**
 * Renders a setting type (the UI input component) with its value and change callback.
 * This is a pure presentation component that takes a setting type definition and renders it.
 */
export function SettingTypeRenderer(props: {
  settingType: SettingsDefinition["type"];
  value: JsonValue;
  changeCallback: (value: JsonValue) => void | Promise<void>;
}) {
  const inputId = useId();
  if (!props.settingType || props.value === undefined) {
    return null;
  }

  switch (props.settingType.case) {
    case "string": {
      return (
        <SettingInputLayout
          disabled={props.settingType.value.disabled}
          title={
            <ComponentTitle
              inputId={inputId}
              title={props.settingType.value.uiName}
              description={props.settingType.value.description}
            />
          }
        >
          <StringComponent
            id={inputId}
            setting={props.settingType.value}
            value={props.value as string}
            changeCallback={props.changeCallback}
          />
        </SettingInputLayout>
      );
    }
    case "int": {
      return (
        <NumericSettingField
          setting={props.settingType.value}
          entry={props.settingType.value}
          value={props.value as number}
          changeCallback={props.changeCallback}
        />
      );
    }
    case "bool": {
      return (
        <Field
          className="max-w-3xl"
          data-disabled={props.settingType.value.disabled}
        >
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
        <NumericSettingField
          setting={props.settingType.value}
          entry={props.settingType.value}
          value={props.value as number}
          changeCallback={props.changeCallback}
        />
      );
    }
    case "combo": {
      return (
        <SettingInputLayout
          disabled={props.settingType.value.disabled}
          title={
            <ComponentTitle
              inputId={inputId}
              title={props.settingType.value.uiName}
              description={props.settingType.value.description}
            />
          }
        >
          <ComboComponent
            id={inputId}
            setting={props.settingType.value}
            value={props.value as string}
            changeCallback={props.changeCallback}
          />
        </SettingInputLayout>
      );
    }
    case "stringList": {
      return (
        <SettingInputLayout
          disabled={props.settingType.value.disabled}
          title={
            <ComponentTitle
              title={props.settingType.value.uiName}
              description={props.settingType.value.description}
            />
          }
        >
          <StringListComponent
            setting={props.settingType.value}
            value={props.value as string[]}
            changeCallback={props.changeCallback}
          />
        </SettingInputLayout>
      );
    }
    case "minMax": {
      return (
        <MinMaxSettingField
          setting={props.settingType.value}
          value={props.value as NumericRange}
          changeCallback={props.changeCallback}
        />
      );
    }
  }
}

function getSettingDefaultValue(
  definition: SettingsDefinition,
): JsonValue | undefined {
  const type = definition.type;
  switch (type.case) {
    case "string":
    case "int":
    case "double":
    case "bool":
    case "combo":
      return type.value.def as JsonValue;
    default:
      return undefined;
  }
}

function formatDefault(value: JsonValue, definition: SettingsDefinition) {
  if (definition.type.case === "combo") {
    return definition.type.value.options.find((option) => option.id === value)
      ?.displayName;
  }
  return typeof value === "boolean" || value === "" ? undefined : String(value);
}

/** Reports the save result next to the setting that changed. */
function SettingStatusRow(props: {
  definition: SettingsDefinition;
  value: JsonValue;
  status: "idle" | "pending" | "success" | "error";
  persisted: boolean;
  overridden: boolean;
  onReset: (value: JsonValue) => void;
}) {
  const { t } = useTranslation("common");
  const defaultValue = getSettingDefaultValue(props.definition);
  const label =
    defaultValue === undefined
      ? undefined
      : formatDefault(defaultValue, props.definition);
  const isDefault = defaultValue === undefined || props.value === defaultValue;
  const canReset = !isDefault && !props.definition.type.value?.disabled;
  const showStatus =
    props.status === "error" || (props.persisted && props.status !== "idle");
  if (!props.overridden && label === undefined && !canReset && !showStatus) {
    return null;
  }
  return (
    <div
      data-slot="setting-status"
      className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
    >
      {props.overridden && (
        <Badge variant="secondary">{t("settingsPage.overridden")}</Badge>
      )}
      {label !== undefined && (
        <span>{t("settingsPage.defaultValue", { value: label })}</span>
      )}
      {canReset && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => props.onReset(defaultValue as JsonValue)}
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
          <span className="text-success-emphasis inline-flex items-center gap-1">
            <CheckIcon className="size-3" />
            {t("settingsPage.saved")}
          </span>
        )}
        {props.status === "error" && (
          <span className="text-destructive inline-flex items-center gap-1">
            <CircleAlertIcon className="size-3" />
            {t("settingsPage.notSaved")}
          </span>
        )}
      </span>
    </div>
  );
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
  mutationTarget: SettingMutationTarget;
  persisted: boolean;
  focused?: boolean;
}) {
  const definition = useSettingsDefinition(props.settingId);
  const fieldRef = useRef<HTMLDivElement>(null);
  const didFocus = useRef(false);
  useEffect(() => {
    if (props.focused && definition && fieldRef.current && !didFocus.current) {
      return focusSettingElement(fieldRef.current, () => {
        didFocus.current = true;
      });
    }
  }, [props.focused, definition]);
  const namespace = props.settingId.namespace;
  const key = props.settingId.key;
  const onSaveError = useSettingSaveError(definition, `${namespace}:${key}`);
  const value = useMemo(
    () => getSettingValue(props.config, definition),
    [props.config, definition],
  );
  const setValueMutation = useMutation({
    ...settingMutationOptions(props.mutationTarget, namespace, key, "value"),
    mutationFn: async (value: JsonValue) => {
      await props.updateConfigEntry(namespace, key, value);
    },
    onError: definition?.type.case === "stringList" ? undefined : onSaveError,
    onSettled: async () => {
      await props.invalidateQuery();
    },
  });

  if (!definition) {
    return null;
  }

  return (
    <div
      ref={fieldRef}
      tabIndex={props.focused ? -1 : undefined}
      role={props.focused ? "group" : undefined}
      aria-label={props.focused ? getSettingLabel(definition) : undefined}
      data-setting-focused={props.focused || undefined}
      className={cn(
        "flex min-w-0 max-w-3xl flex-col has-[>[data-slot=setting-status]]:gap-2",
        props.focused && "scroll-mt-4 rounded-lg p-3 ring-2 ring-ring",
      )}
    >
      <SettingTypeRenderer
        settingType={definition.type}
        value={value}
        changeCallback={
          definition.type.case === "stringList" ||
          definition.type.case === "string" ||
          definition.type.case === "int" ||
          definition.type.case === "double" ||
          definition.type.case === "minMax"
            ? setValueMutation.mutateAsync
            : setValueMutation.mutate
        }
      />
      <SettingStatusRow
        definition={definition}
        value={value}
        status={setValueMutation.status}
        persisted={props.persisted}
        overridden={
          props.mutationTarget.type === "bot" &&
          props.config.settings[namespace]?.[key] !== undefined
        }
        onReset={setValueMutation.mutate}
      />
    </div>
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
      <SettingFieldByKey
        key={
          settingMutationOptions(
            { type: "instance", instanceId: instanceInfo.id },
            props.namespace,
            props.settingKey,
            "value",
          ).scope.id
        }
        {...props}
        mutationTarget={{ type: "instance", instanceId: instanceInfo.id }}
      />
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
  mutationTarget: SettingMutationTarget;
}) {
  const definition = useSettingsDefinitionByKey(
    props.namespace,
    props.settingKey,
  );
  const onSaveError = useSettingSaveError(
    definition,
    `${props.namespace}:${props.settingKey}`,
  );
  const value = useMemo(
    () => getSettingValue(props.config, definition),
    [props.config, definition],
  );
  const setValueMutation = useMutation({
    ...settingMutationOptions(
      props.mutationTarget,
      props.namespace,
      props.settingKey,
      "value",
    ),
    mutationFn: async (value: JsonValue) => {
      await props.updateConfigEntry(props.namespace, props.settingKey, value);
    },
    onError: definition?.type.case === "stringList" ? undefined : onSaveError,
    onSettled: async () => {
      await props.invalidateQuery();
    },
  });

  if (!definition) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <SettingTypeRenderer
        settingType={definition.type}
        value={value}
        changeCallback={
          definition.type.case === "stringList" ||
          definition.type.case === "string" ||
          definition.type.case === "int" ||
          definition.type.case === "double" ||
          definition.type.case === "minMax"
            ? setValueMutation.mutateAsync
            : setValueMutation.mutate
        }
      />
      <SettingStatusRow
        definition={definition}
        value={value}
        status={setValueMutation.status}
        persisted
        overridden={false}
        onReset={setValueMutation.mutate}
      />
    </div>
  );
}

export type DisabledSettingId = {
  namespace: string;
  key: string;
};

export function ClientSettingsPageComponent<T extends BaseSettings>({
  data,
  invalidateQuery,
  updateConfigEntry,
  config,
  mutationTarget,
  disabledIds = [],
  definitions,
  allPages,
  persisted,
  linkToPage,
  focusSetting,
}: {
  data: SettingsPage;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: T;
  mutationTarget: SettingMutationTarget;
  disabledIds?: readonly DisabledSettingId[];
  definitions: readonly SettingsDefinition[];
  allPages?: readonly SettingsPage[];
  persisted: boolean;
  linkToPage?: (page: SettingsPage, label: ReactNode) => ReactNode;
  focusSetting?: SettingFocus;
}) {
  const { t } = useTranslation("common");
  const openCommandPalette = useCommandPalette();
  const [query, setQuery] = useState("");
  // The filter stays visible while it has text, so no field is hidden silently.
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFilterFocus = useRef(false);
  useEffect(() => {
    if (filterOpen || !restoreFilterFocus.current) return;
    restoreFilterFocus.current = false;
    filterButtonRef.current?.focus();
  }, [filterOpen]);
  const closeFilter = () => {
    restoreFilterFocus.current = true;
    setQuery("");
    setFilterOpen(false);
  };
  const enabledIdentifier = data.enabledIdentifier;
  const visibleEntries = useMemo(() => {
    const hidden = [...disabledIds];
    if (enabledIdentifier) hidden.push(enabledIdentifier);
    return data.entries.filter(
      (entryId) =>
        !hidden.some(
          (id) => entryId.namespace === id.namespace && entryId.key === id.key,
        ),
    );
  }, [data.entries, disabledIds, enabledIdentifier]);
  const matches = useMemo(
    () => filterSettingsEntries(visibleEntries, definitions, query),
    [visibleEntries, definitions, query],
  );
  const { common, advanced } = useMemo(
    () => splitSettingsEntries(data.id, matches),
    [data.id, matches],
  );
  const otherPages = useMemo(
    () =>
      allPages
        ? findSettingsOnOtherPages(data.id, allPages, definitions, query)
        : [],
    [allPages, data.id, definitions, query],
  );
  const searching = query.trim() !== "";
  const renderEntry = (entryId: SettingsEntryIdentifier) => (
    <SettingField
      key={
        settingMutationOptions(
          mutationTarget,
          entryId.namespace,
          entryId.key,
          "value",
        ).scope.id
      }
      settingId={entryId}
      mutationTarget={mutationTarget}
      updateConfigEntry={updateConfigEntry}
      invalidateQuery={invalidateQuery}
      config={config}
      persisted={persisted}
      focused={isFocusedSetting(entryId, focusSetting)}
    />
  );

  const renderEntries = (entries: SettingsEntryIdentifier[]) => (
    <FieldGroup className="gap-6">{entries.map(renderEntry)}</FieldGroup>
  );

  const sections = groupSettingsEntries(data.id, common);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {t(`settingsPage.scope.${mutationTarget.type}`)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {filterOpen ? (
            <InputGroup className="w-full sm:max-w-xs">
              <InputGroupAddon>
                <ListFilterIcon />
              </InputGroupAddon>
              <InputGroupInput
                // A search input adds its own clear button next to ours.
                role="searchbox"
                autoFocus
                aria-label={t("settingsPage.filter")}
                placeholder={t("settingsPage.filterPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || event.nativeEvent.isComposing)
                    return;
                  // Escape clears the text first, then closes the filter.
                  event.preventDefault();
                  event.stopPropagation();
                  if (query) setQuery("");
                  else closeFilter();
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t("settingsPage.closeFilter")}
                  onClick={closeFilter}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          ) : (
            <Button
              ref={filterButtonRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen(true)}
            >
              <ListFilterIcon data-icon="inline-start" />
              {t("settingsPage.filter")}
            </Button>
          )}
          <p className="text-muted-foreground inline-flex items-center gap-2 text-xs">
            <InfoIcon className="size-3.5 shrink-0" />
            {t(
              persisted ? "settingsPage.autoSave" : "settingsPage.demoNotSaved",
            )}
          </p>
        </div>
      </div>
      {matches.length === 0 && searching && (
        <div className="flex max-w-3xl flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-sm" role="status">
            {t("settingsPage.noMatches", { query: query.trim() })}
          </p>
          {openCommandPalette && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openCommandPalette({ search: query.trim() })}
            >
              <SearchIcon data-icon="inline-start" />
              {t("settingsPage.searchEverywhere")}
            </Button>
          )}
        </div>
      )}
      {otherPages.length > 0 && linkToPage && (
        <p className="text-muted-foreground text-sm">
          {t("settingsPage.otherPages")}{" "}
          {otherPages.map(({ page, count }, index) => (
            <span key={page.id}>
              {index > 0 && ", "}
              {linkToPage(page, `${page.pageName} (${count})`)}
            </span>
          ))}
        </p>
      )}
      {common.length > 0 && (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section
              key={section.id}
              className="flex flex-col gap-5"
              aria-label={
                section.id === "other"
                  ? undefined
                  : t(`settingsPage.sections.${section.id}.title`)
              }
            >
              {section.id !== "other" && (
                <div className="flex max-w-3xl flex-col gap-1">
                  <h3 className="text-base font-semibold">
                    {t(`settingsPage.sections.${section.id}.title`)}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t(`settingsPage.sections.${section.id}.description`)}
                  </p>
                </div>
              )}
              {renderEntries(section.entries)}
            </section>
          ))}
        </div>
      )}
      {advanced.length > 0 &&
        (searching ||
        advanced.some((entry) => isFocusedSetting(entry, focusSetting)) ? (
          renderEntries(advanced)
        ) : (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="group/advanced"
                />
              }
            >
              <ChevronRightIcon
                data-icon="inline-start"
                className="group-data-[panel-open]/advanced:rotate-90"
              />
              {t("settingsPage.advanced", { count: advanced.length })}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-6">
              {renderEntries(advanced)}
            </CollapsibleContent>
          </Collapsible>
        ))}
    </div>
  );
}

export function InstanceSettingsPageComponent({
  data,
  disabledIds,
  focusSetting,
}: {
  data: SettingsPage;
  disabledIds?: readonly DisabledSettingId[];
  focusSetting?: SettingFocus;
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
        key={JSON.stringify([
          instanceInfo.id,
          data.id,
          focusSetting?.namespace,
          focusSetting?.key,
        ])}
        data={data}
        focusSetting={focusSetting}
        mutationTarget={{ type: "instance", instanceId: instanceInfo.id }}
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
        definitions={instanceInfo.settingsDefinitions}
        allPages={instanceInfo.instanceSettings}
        persisted={transport !== null}
        linkToPage={(page, label) => (
          <Link
            className="underline underline-offset-3"
            to="/instance/$instance/settings/$pageId"
            params={{ instance: instanceInfo.id, pageId: page.id }}
          >
            {label}
          </Link>
        )}
      />
    </SettingsRegistryContext.Provider>
  );
}

export function AdminSettingsPageComponent({
  data,
  focusSetting,
}: {
  data: SettingsPage;
  focusSetting?: SettingFocus;
}) {
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
        key={JSON.stringify([
          data.id,
          focusSetting?.namespace,
          focusSetting?.key,
        ])}
        data={data}
        focusSetting={focusSetting}
        mutationTarget={{ type: "server" }}
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
        definitions={serverInfo.settingsDefinitions}
        allPages={serverInfo.serverSettings}
        persisted={transport !== null}
        linkToPage={(page, label) => (
          <Link
            className="underline underline-offset-3"
            to="/user/admin/settings/$pageId"
            params={{ pageId: page.id }}
          >
            {label}
          </Link>
        )}
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
        mutationTarget={{ type: "bot", instanceId: instanceInfo.id, botId }}
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
        definitions={instanceInfo.settingsDefinitions}
        persisted={transport !== null}
      />
    </SettingsRegistryContext.Provider>
  );
}

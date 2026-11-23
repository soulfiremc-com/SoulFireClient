import type { JsonValue } from "@bufbuild/protobuf";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useLocation, useRouteContext } from "@tanstack/react-router";
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
  type KeyboardEvent,
  type ReactNode,
  memo,
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
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Command,
  CommandEmpty,
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
  type SettingsDefinition,
  type SettingsEntryIdentifier,
  type SettingsPage,
  type StringListSetting,
  type StringSetting,
  StringSetting_InputType,
} from "@/generated/soulfire/common_pb";
import { useCachedState } from "@/hooks/use-cached-state.ts";
import { useSettingValueMutation } from "@/hooks/use-setting-value-mutation.ts";
import { useLocaleNumberFormat } from "@/hooks/use-locale-number-format.tsx";
import {
  createStringListEntry,
  getSavedStringListValues,
  keepClearedEntries,
  markClearedEntry,
  reconcileStringListEntries,
  type StringListEntry,
} from "@/lib/string-list-entries.ts";
import { NumericRangeEditor } from "@/lib/numeric-range-editor.ts";
import {
  DebouncedCommit,
  flushWhenPageHides,
  SETTING_SAVE_DELAY_MS,
} from "@/lib/debounced-commit.ts";
import { searchComboOptions } from "@/lib/combo-option-search.ts";
import {
  focusSettingElement,
  getSettingLabel,
  isFocusedSetting,
  type SettingFocus,
} from "@/lib/settings-focus";
import {
  formatSettingNumber,
  getNumericSettingValue,
  type NumericRange,
} from "@/lib/numeric-setting-value.ts";
import {
  settingMutationOptions,
  type SettingMutationTarget,
} from "@/lib/setting-mutation-options.ts";
import { settingDestination } from "@/lib/command-palette.ts";
import {
  filterSettingsEntries,
  findSettingsOnOtherPages,
  splitSettingsEntries,
  groupSettingsEntries,
} from "@/lib/settings-discovery.ts";
import {
  getSettingDefaultValue,
  isSameSettingValue,
} from "@/lib/setting-default-value.ts";
import type { BaseSettings } from "@/lib/types.ts";
import {
  cn,
  getSettingValue,
  updateInstanceConfigEntry,
  updateServerConfigEntry,
} from "@/lib/utils.tsx";
import { requireField } from "@/lib/require-field";
import { displayText } from "@/lib/display-text";

function SettingInputLayout(props: {
  title: ReactNode;
  children: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Field
      className="max-w-3xl min-w-0"
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
  descriptionId?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {props.inputId ? (
        <FieldLabel htmlFor={props.inputId}>{props.title}</FieldLabel>
      ) : (
        <p className="text-sm font-medium">{props.title}</p>
      )}
      {props.description && (
        <FieldDescription id={props.descriptionId}>
          {props.description}
        </FieldDescription>
      )}
    </div>
  );
}

/**
 * Saves the latest edit once typing pauses, on unmount, and when the page is
 * hidden. React does not unmount on reload or window close, so hiding the
 * page sends a held edit before the pause would end.
 */
function useDebouncedSave<T>() {
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [saver] = useState(() => new DebouncedCommit<T>(SETTING_SAVE_DELAY_MS));
  useEffect(() => flushWhenPageHides(saver), [saver]);
  return saver;
}

function flushOnEnter(saver: { flush: () => void }) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter") saver.flush();
  };
}

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

function StringComponent(props: {
  id: string;
  describedBy: string | undefined;
  setting: StringSetting;
  value: string;
  changeCallback: (value: string) => void | Promise<void>;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [scheduled, setScheduled] = useState(false);
  const [inputValue, setInputValue] = useCachedState(props.value, {
    shouldSync: !isFocused && pendingWrites === 0 && !scheduled,
  });
  const saver = useDebouncedSave<string>();

  const saveValue = async (value: string) => {
    setScheduled(false);
    setPendingWrites((count) => count + 1);
    try {
      await props.changeCallback(value);
    } catch {
      // The mutation reports the failure and reloads the stored value.
    } finally {
      setPendingWrites((count) => count - 1);
    }
  };
  const onChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const newValue = e.currentTarget.value;
    setInputValue(newValue);
    setScheduled(true);
    saver.schedule(newValue, (value) => void saveValue(value));
  };
  const onBlur = () => {
    setIsFocused(false);
    saver.flush();
  };

  if (props.setting.inputType === StringSetting_InputType.TEXTAREA) {
    return (
      <Textarea
        id={props.id}
        aria-label={props.setting.uiName}
        aria-describedby={props.describedBy}
        aria-busy={pendingWrites > 0 || scheduled}
        value={inputValue}
        placeholder={props.setting.placeholder}
        minLength={props.setting.minLength}
        maxLength={props.setting.maxLength}
        disabled={props.setting.disabled}
        onChange={onChangeHandler}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={onBlur}
      />
    );
  }
  return (
    <Input
      id={props.id}
      appearance="settings"
      aria-label={props.setting.uiName}
      aria-describedby={props.describedBy}
      aria-busy={pendingWrites > 0 || scheduled}
      value={inputValue}
      type={inputTypeToHtml(props.setting.inputType)}
      placeholder={props.setting.placeholder}
      minLength={props.setting.minLength}
      maxLength={props.setting.maxLength}
      pattern={props.setting.pattern}
      disabled={props.setting.disabled}
      onChange={onChangeHandler}
      onKeyDown={flushOnEnter(saver)}
      onFocus={() => {
        setIsFocused(true);
      }}
      onBlur={onBlur}
    />
  );
}

function NumericSettingField(props: {
  setting: IntSetting | DoubleSetting | MinMaxSetting;
  entry: Pick<IntSetting, "uiName" | "description" | "placeholder">;
  value: number;
  changeCallback: (value: number) => void | Promise<void>;
  onFocus?: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const id = useId();
  const localeNumberFormat = useLocaleNumberFormat();
  const [isFocused, setIsFocused] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [scheduled, setScheduled] = useState(false);
  const [draft, setDraft] = useCachedState<string | number>(props.value, {
    shouldSync: !isFocused && pendingWrites === 0 && !scheduled,
  });
  const saver = useDebouncedSave<number>();
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
  const descriptionId = props.entry.description
    ? `${id}-description`
    : undefined;
  const describedBy =
    [descriptionId, invalid ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;
  const formatBound = (value: number) =>
    formatSettingNumber(value, i18n.language, props.setting.thousandSeparator);
  const saveValue = async (value: number) => {
    setScheduled(false);
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
      busy={pendingWrites > 0 || scheduled}
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
        value={draft}
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
          setDraft(values.value);
          const value = getNumericSettingValue(
            values.value,
            props.setting.min,
            props.setting.max,
            decimalScale === 0,
          );
          if (value === undefined) {
            // Keep the stored value instead of an earlier valid prefix.
            saver.cancel();
            setScheduled(false);
            return;
          }
          setScheduled(true);
          saver.schedule(value, (next) => void saveValue(next));
        }}
        placeholder={props.entry.placeholder}
        inputMode={decimalScale === 0 ? "numeric" : "decimal"}
        min={props.setting.min}
        max={props.setting.max}
        step={props.setting.step}
        disabled={props.setting.disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onKeyDown={flushOnEnter(saver)}
        onFocusCapture={() => {
          // NumericFormat defers onFocus, so capture the baseline before a change.
          props.onFocus?.();
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          saver.flush();
        }}
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

function MinMaxSettingField(props: {
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

function BoolComponent(props: {
  setting: BoolSetting;
  value: boolean;
  pending?: boolean | undefined;
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
        <div className="inline-flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-2">
          <span className="text-sm">
            {t(props.value ? "pluginCard.enabled" : "pluginCard.disabled")}
          </span>
          <Switch
            id={id}
            aria-describedby={
              props.description ? `${id}-description` : undefined
            }
            checked={props.value}
            aria-busy={props.pending || undefined}
            disabled={props.setting.disabled}
            onCheckedChange={props.changeCallback}
          />
        </div>
      </div>
    </>
  );
}

const COMBO_RESULT_LIMIT = 50;

function ComboComponent(props: {
  id: string;
  describedBy: string | undefined;
  setting: ComboSetting;
  value: string;
  pending?: boolean | undefined;
  changeCallback: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = props.setting.options.find(
    (option) => option.id === props.value,
  );
  // Render a ranked slice. Combos such as the protocol version have hundreds
  // of options, and mounting all of them made the picker slow to open.
  const results = useMemo(
    () =>
      searchComboOptions(
        props.setting.options,
        query,
        COMBO_RESULT_LIMIT,
        props.value,
      ),
    [props.setting.options, query, props.value],
  );
  const hiddenCount = results.total - results.options.length;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={props.id}
            variant="outline"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/role-has-required-aria-props -- custom combobox with a filtered popup list, which a native select cannot provide; PopoverTrigger adds aria-controls for the popup it opens
            role="combobox"
            aria-label={props.setting.uiName}
            aria-describedby={props.describedBy}
            aria-expanded={open}
            aria-busy={props.pending || undefined}
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
        {props.pending ? (
          <LoaderCircleIcon
            className="animate-spin"
            data-icon="inline-end"
            aria-label={t("settingsPage.saving")}
          />
        ) : (
          <ChevronsUpDown className="opacity-50" data-icon="inline-end" />
        )}
      </PopoverTrigger>
      <PopoverContent
        aria-label={props.setting.uiName}
        className="w-(--anchor-width) p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("settingsPage.combo.searchPlaceholder")}
          />
          <CommandList>
            <CommandEmpty>{t("settingsPage.combo.empty")}</CommandEmpty>
            <CommandGroup>
              {results.options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => {
                    setOpen(false);
                    setQuery("");
                    if (option.id !== props.value) {
                      props.changeCallback(option.id);
                    }
                  }}
                >
                  <Check
                    className={
                      props.value === option.id ? "opacity-100" : "opacity-0"
                    }
                  />
                  {option.iconId && <DynamicIcon name={option.iconId} />}
                  {option.displayName}
                </CommandItem>
              ))}
            </CommandGroup>
            {hiddenCount > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t("settingsPage.combo.more", { count: hiddenCount })}
              </p>
            )}
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
    edited: boolean;
    cleared: ReadonlySet<string>;
  }>(() => ({
    entries: props.value.map(createStringListEntry),
    source: props.value,
    pending: 0,
    edited: false,
    cleared: new Set(),
  }));
  if (
    list.pending === 0 &&
    !list.edited &&
    list.cleared.size === 0 &&
    list.source !== props.value
  ) {
    setList({
      ...list,
      entries: reconcileStringListEntries(list.entries, props.value),
      source: props.value,
    });
  }
  const [newEntryInput, setNewEntryInput] = useState("");
  const draftRevision = useRef(0);
  const saver = useDebouncedSave<{
    entries: StringListEntry[];
    cleared: ReadonlySet<string>;
  }>();

  const saveEntries = async (
    entries: StringListEntry[],
    cleared: ReadonlySet<string> = list.cleared,
  ) => {
    // This save includes any edit that was still waiting for a pause.
    saver.cancel();
    const kept = keepClearedEntries(cleared, entries);
    setList((current) => ({
      entries,
      source: undefined,
      pending: current.pending + 1,
      edited: false,
      cleared: kept,
    }));
    try {
      await props.changeCallback(getSavedStringListValues(entries, kept));
      return true;
    } catch {
      // The setting mutation reports the failure.
      return false;
    } finally {
      setList((current) => ({ ...current, pending: current.pending - 1 }));
    }
  };
  const insertValue = async (value: string) => {
    if (value.trim() === "") return;
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
    const entries = list.entries.map((entry) =>
      entry.id === id ? { ...entry, value } : entry,
    );
    const cleared = markClearedEntry(list.cleared, { id, value });
    setList((current) => ({
      ...current,
      entries,
      source: undefined,
      edited: true,
      cleared,
    }));
    saver.schedule(
      { entries, cleared },
      (next) => void saveEntries(next.entries, next.cleared),
    );
  };
  const deleteId = (id: string) => {
    void saveEntries(list.entries.filter((entry) => entry.id !== id));
  };
  const removeAll = async () => {
    const previous = list.entries.filter(
      (entry) => !list.cleared.has(entry.id),
    );
    if (!(await saveEntries([]))) return;
    toast.success(
      t("settingsPage.stringList.removedAll", {
        name: props.setting.uiName,
        count: previous.length,
      }),
      {
        action: {
          label: t("settingsPage.stringList.undo"),
          onClick: () => {
            void saveEntries(previous, new Set());
          },
        },
      },
    );
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
              disabled={props.setting.disabled || newEntryInput.trim() === ""}
            >
              <PlusIcon />
              {t("settingsPage.stringList.add")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {list.entries.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("settingsPage.stringList.count", {
                count: list.entries.length,
              })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={props.setting.disabled}
              onClick={() => {
                void removeAll();
              }}
            >
              <TrashIcon data-icon="inline-start" />
              {t("settingsPage.stringList.removeAll")}
            </Button>
          </div>
        )}
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
              onKeyDown={flushOnEnter(saver)}
              onBlur={() => {
                // A cleared entry is removed instead of saved as blank text.
                // Switching to another window keeps it, so a replacement
                // can be pasted in place.
                if (item.value.trim() === "" && document.hasFocus()) {
                  deleteId(item.id);
                } else {
                  saver.flush();
                }
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
          <StringComponent
            id={inputId}
            describedBy={descriptionId}
            setting={props.settingType.value}
            value={typeof props.value === "string" ? props.value : ""}
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
          value={typeof props.value === "number" ? props.value : 0}
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
            value={props.value === true}
            pending={props.pending}
            changeCallback={(value) => void props.changeCallback(value)}
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
          value={typeof props.value === "number" ? props.value : 0}
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
              descriptionId={descriptionId}
              title={props.settingType.value.uiName}
              description={props.settingType.value.description}
            />
          }
        >
          <ComboComponent
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
            value={isStringArray(props.value) ? props.value : []}
            changeCallback={props.changeCallback}
          />
        </SettingInputLayout>
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

/** Reports the save result next to the setting that changed. */
function SettingStatusRow(props: {
  definition: SettingsDefinition;
  value: JsonValue;
  status: "idle" | "pending" | "success" | "error";
  persisted: boolean;
  onReset: (value: JsonValue) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const type = props.definition.type;
  const defaultValue = getSettingDefaultValue(props.definition);
  const label =
    defaultValue === undefined
      ? undefined
      : formatDefault(
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
        );
  const isDefault =
    defaultValue === undefined || isSameSettingValue(props.value, defaultValue);
  const canReset = !isDefault && !type.value?.disabled;
  const showStatus =
    props.status === "error" || (props.persisted && props.status !== "idle");
  if (label === undefined && !canReset && !showStatus) {
    return null;
  }
  return (
    <div
      data-slot="setting-status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      {label !== undefined && (
        <span>{t("settingsPage.defaultValue", { value: label })}</span>
      )}
      {canReset && (
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

/** Settings pages edit project or server settings. Bot overrides use the account dialog. */
type SettingsPageTarget = Exclude<SettingMutationTarget, { type: "bot" }>;

interface SettingFieldProps {
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: BaseSettings;
  mutationTarget: SettingsPageTarget;
  persisted: boolean;
}

/**
 * Component that renders a setting field by its identifier.
 * This is the main component for mounting settings anywhere in the UI.
 * It looks up the setting definition from context and handles value management.
 */
function SettingField(
  props: SettingFieldProps & {
    definition: SettingsDefinition | undefined;
    namespace: string;
    settingKey: string;
    focused?: boolean;
    /** Changes on each jump to a setting, so a repeated jump focuses again. */
    focusRequest?: string | undefined;
  },
) {
  const { definition } = props;
  const fieldRef = useRef<HTMLDivElement>(null);
  // The focus request this field already handled, or undefined.
  const handledRequest = useRef<string | null | undefined>(undefined);
  const focusRequest = props.focusRequest ?? null;
  useEffect(() => {
    if (!props.focused) {
      // Focus again when a later navigation points at this setting.
      handledRequest.current = undefined;
      return undefined;
    }
    if (
      definition &&
      fieldRef.current &&
      handledRequest.current !== focusRequest
    ) {
      return focusSettingElement(fieldRef.current, () => {
        handledRequest.current = focusRequest;
      });
    }
    return undefined;
  }, [props.focused, focusRequest, definition]);
  const storedValue = useMemo(
    () => getSettingValue(props.config, definition),
    [props.config, definition],
  );
  const setting = useSettingValueMutation({
    definition,
    target: props.mutationTarget,
    namespace: props.namespace,
    settingKey: props.settingKey,
    storedValue,
    persisted: props.persisted,
    save: async (value) =>
      props.updateConfigEntry(props.namespace, props.settingKey, value),
    invalidate: props.invalidateQuery,
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
        "flex max-w-3xl min-w-0 flex-col has-[>[data-slot=setting-status]]:gap-2",
        props.focused && "scroll-mt-4 rounded-lg p-3 ring-2 ring-ring",
      )}
    >
      <SettingTypeRenderer
        settingType={definition.type}
        value={setting.value}
        pending={setting.pending}
        changeCallback={setting.changeCallback}
      />
      <SettingStatusRow
        definition={definition}
        value={setting.value}
        status={setting.status}
        persisted={props.persisted}
        onReset={setting.reset}
      />
    </div>
  );
}

function SettingFieldById(
  props: SettingFieldProps & {
    settingId: SettingsEntryIdentifier;
    focused: boolean;
    focusRequest: string | undefined;
  },
) {
  const { settingId, ...rest } = props;
  const definition = useSettingsDefinition(settingId);
  return (
    <SettingField
      {...rest}
      definition={definition}
      namespace={settingId.namespace}
      settingKey={settingId.key}
    />
  );
}

/**
 * Component that renders a setting field by namespace and key strings.
 * Convenience wrapper around SettingField for when you have separate strings.
 */
function SettingFieldByKey(
  props: SettingFieldProps & { namespace: string; settingKey: string },
) {
  const definition = useSettingsDefinitionByKey(
    props.namespace,
    props.settingKey,
  );
  return <SettingField {...props} definition={definition} />;
}

export function InstanceSettingFieldByKey(props: {
  namespace: string;
  settingKey: string;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: BaseSettings;
}) {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const persisted = use(TransportContext) !== null;
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
        persisted={persisted}
        mutationTarget={{ type: "instance", instanceId: instanceInfo.id }}
      />
    </SettingsRegistryContext.Provider>
  );
}

export interface DisabledSettingId {
  namespace: string;
  key: string;
}

const NO_DISABLED_IDS: readonly DisabledSettingId[] = [];

export function ClientSettingsPageComponent({
  data,
  invalidateQuery,
  updateConfigEntry,
  config,
  mutationTarget,
  disabledIds = NO_DISABLED_IDS,
  definitions,
  allPages,
  persisted,
  linkToPage,
  focusSetting,
  focusRequest,
}: {
  data: SettingsPage;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: BaseSettings;
  mutationTarget: SettingsPageTarget;
  disabledIds?: readonly DisabledSettingId[] | undefined;
  definitions: readonly SettingsDefinition[];
  allPages?: readonly SettingsPage[];
  persisted: boolean;
  linkToPage?: (page: SettingsPage, label: ReactNode) => ReactNode;
  focusSetting?: SettingFocus | undefined;
  /** Changes on each jump to a setting, so a repeated jump focuses again. */
  focusRequest?: string | undefined;
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
    <SettingFieldById
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
      focusRequest={focusRequest}
    />
  );

  const renderEntries = (entries: SettingsEntryIdentifier[]) => (
    <FieldGroup className="gap-6">
      {entries.map((entryId) => renderEntry(entryId))}
    </FieldGroup>
  );

  const sections = groupSettingsEntries(data.id, common);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">
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
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- type="search" would add a second clear button
                role="searchbox"
                autoFocus
                aria-label={t("settingsPage.filter")}
                placeholder={t("settingsPage.filterPlaceholder")}
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                }}
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
              onClick={() => {
                setFilterOpen(true);
              }}
            >
              <ListFilterIcon data-icon="inline-start" />
              {t("settingsPage.filter")}
            </Button>
          )}
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <InfoIcon className="size-3.5 shrink-0" />
            {t(
              persisted ? "settingsPage.autoSave" : "settingsPage.demoNotSaved",
            )}
          </p>
        </div>
      </div>
      {matches.length === 0 && searching && (
        <div className="flex max-w-3xl flex-wrap items-center gap-3">
          <output className="block text-sm text-muted-foreground">
            {t("settingsPage.noMatches", { query: query.trim() })}
          </output>
          {openCommandPalette && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                openCommandPalette({ search: query.trim() });
              }}
            >
              <SearchIcon data-icon="inline-start" />
              {t("settingsPage.searchEverywhere")}
            </Button>
          )}
        </div>
      )}
      {otherPages.length > 0 && linkToPage && (
        <p className="text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
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
                className="group-data-panel-open/advanced:rotate-90"
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
  disabledIds?: readonly DisabledSettingId[] | undefined;
  focusSetting?: SettingFocus | undefined;
}) {
  const queryClient = useQueryClient();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const transport = use(TransportContext);
  const profile = instanceInfo.profile;
  const focusRequest = useLocation({
    select: (location) => location.state.settingFocusRequest,
  });
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(instanceInfo.settingsDefinitions),
    [instanceInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        key={JSON.stringify([instanceInfo.id, data.id])}
        data={data}
        focusSetting={focusSetting}
        focusRequest={focusRequest}
        mutationTarget={{ type: "instance", instanceId: instanceInfo.id }}
        updateConfigEntry={async (namespace, key, value) =>
          updateInstanceConfigEntry(
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
            {...settingDestination(
              { kind: "project", id: instanceInfo.id },
              page.id,
            )}
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
  focusSetting?: SettingFocus | undefined;
}) {
  const queryClient = useQueryClient();
  const serverInfoQueryOptions = useRouteContext({
    from: "/_dashboard/user/admin",
    select: (context) => context.serverInfoQueryOptions,
  });
  const { data: serverInfo } = useSuspenseQuery(serverInfoQueryOptions);
  const serverConfig = serverInfo.profile;
  const transport = use(TransportContext);
  const focusRequest = useLocation({
    select: (location) => location.state.settingFocusRequest,
  });
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(serverInfo.settingsDefinitions),
    [serverInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        key={data.id}
        data={data}
        focusSetting={focusSetting}
        focusRequest={focusRequest}
        mutationTarget={{ type: "server" }}
        updateConfigEntry={async (namespace, key, value) =>
          updateServerConfigEntry(
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

function isStringArray(value: JsonValue): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNumericRange(value: JsonValue): value is NumericRange {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value["min"] === "number" &&
    typeof value["max"] === "number"
  );
}

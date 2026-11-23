import { PlusIcon, TrashIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ComponentTitle,
  SettingInputLayout,
} from "@/components/settings/setting-layout.tsx";
import {
  flushOnEnter,
  useDebouncedSave,
} from "@/components/settings/use-setting-draft.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import type { StringListSetting } from "@/generated/soulfire/common_pb";
import {
  createStringListEntry,
  getSavedStringListValues,
  keepClearedEntries,
  markClearedEntry,
  reconcileStringListEntries,
  type StringListEntry,
} from "@/lib/string-list-entries.ts";

function StringListInput(props: {
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
  // While an entry has focus, a reload must not replace the text being typed,
  // for example after a failed save.
  const [entryFocused, setEntryFocused] = useState(false);
  if (
    list.pending === 0 &&
    !list.edited &&
    !entryFocused &&
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
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
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
              onFocus={() => {
                setEntryFocused(true);
              }}
              onBlur={() => {
                setEntryFocused(false);
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

export function StringListSettingField(props: {
  setting: StringListSetting;
  value: string[];
  changeCallback: (value: string[]) => void | Promise<void>;
}) {
  return (
    <SettingInputLayout
      disabled={props.setting.disabled}
      title={
        <ComponentTitle
          title={props.setting.uiName}
          description={props.setting.description}
        />
      }
    >
      <StringListInput {...props} />
    </SettingInputLayout>
  );
}

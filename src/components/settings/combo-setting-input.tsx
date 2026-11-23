import { ChevronsUpDown, Check, LoaderCircleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import type { ComboSetting } from "@/generated/soulfire/common_pb";
import { searchComboOptions } from "@/lib/combo-option-search.ts";

const COMBO_RESULT_LIMIT = 50;

export function ComboSettingInput(props: {
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

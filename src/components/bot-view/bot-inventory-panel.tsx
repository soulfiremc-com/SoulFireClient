import { create } from "@bufbuild/protobuf";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Effect } from "effect";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HandIcon,
  PackageIcon,
  PencilIcon,
  ShieldIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { use, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotPanel, BotPanelEmpty } from "@/components/bot-view/bot-panel.tsx";
import {
  botInfoQueryOptions,
  createBotClient,
  inventoryStateQueryOptions,
  toastError,
} from "@/components/bot-view/bot-queries.ts";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  type BookPage,
  BotContainerButtonClickRequestSchema,
  BotInventoryClickRequestSchema,
  BotSetContainerTextRequestSchema,
  ClickType,
  type ContainerButton,
  type ContainerTextInput,
  type InventorySlot,
  type SlotRegion,
  SlotRegionType,
} from "@/generated/soulfire/bot_pb";
import { useMutationScopePending } from "@/hooks/use-mutation-scope-pending";
import {
  containerMutationOptions,
  containerMutationScopeId,
} from "@/lib/container-mutation-options";
import {
  type SlotClickKind,
  slotContextMenuClick,
  slotKeyAction,
  slotPrimaryClick,
} from "@/lib/inventory-slot-keys.ts";
import { editBoxInsertion, editBoxValue } from "@/lib/minecraft-edit-box";
import {
  createServerInputDraft,
  editServerInputDraft,
  syncServerInputDraft,
} from "@/lib/server-input-draft";
import { cn } from "@/lib/utils.tsx";

const CLICK_TYPES = {
  left: ClickType.LEFT_CLICK,
  right: ClickType.RIGHT_CLICK,
  shift: ClickType.SHIFT_LEFT_CLICK,
  middle: ClickType.MIDDLE_CLICK,
} as const satisfies Record<SlotClickKind, ClickType>;

const CREATIVE_CATALOG = "creative_catalog";
const CREATIVE_TRASH = "destroy_item";

function formatItemId(itemId: string): string {
  return itemId.replace(/^minecraft:/u, "").replaceAll("_", " ");
}

function itemName(item: InventorySlot): string {
  return item.tooltipLines[0] || item.displayName || formatItemId(item.itemId);
}

function inventoryItemImageSrc(item: InventorySlot): string | undefined {
  if (!item.iconBase64 || !item.iconMimeType) return undefined;
  return `data:${item.iconMimeType};base64,${item.iconBase64}`;
}

/** The bot's inventory or open container, with slot clicks and container controls. */
export function BotInventoryPanel({
  instanceId,
  botId,
}: {
  instanceId: string;
  botId: string;
}) {
  const { t } = useTranslation("instance");
  const demo = use(TransportContext) === null;
  const hintsId = useId();
  const [clickMode, setClickMode] = useState<SlotClickKind>("left");
  const { data: isOnline } = useSuspenseQuery({
    ...botInfoQueryOptions(instanceId, botId),
    select: (info) => info.liveState !== undefined,
  });
  const { data: inventoryState, refetch } = useSuspenseQuery({
    ...inventoryStateQueryOptions(instanceId, botId),
    refetchInterval: isOnline ? 1000 : false,
  });
  const menuId = inventoryState?.menuId;
  const isPending = useMutationScopePending(
    containerMutationScopeId(instanceId, botId, menuId),
  );

  const requireSuccess = <
    T extends { success: boolean; error?: string | undefined },
  >(
    result: T,
  ): T => {
    if (!result.success)
      throw new Error(result.error || t("bots.inventoryPanel.actionRejected"));
    return result;
  };
  const containerMutation = (
    action: "click" | "close" | "button" | "text",
  ) => ({
    ...containerMutationOptions(instanceId, botId, menuId, action),
    onError: (error: Error) => {
      toastError(t("bots.inventoryPanel.actionError"), error);
    },
    onSettled: async () => {
      // Text drafts wait for the server value. Clicks queue in order, so
      // they must not wait for a refresh before the next one runs.
      if (action === "text") await refetch();
      else void refetch();
    },
  });

  const { mutate: mutateClick } = useMutation({
    ...containerMutation("click"),
    mutationFn: async ({
      slot,
      clickType,
    }: {
      slot: number;
      clickType: ClickType;
    }) =>
      requireSuccess(
        await Effect.runPromise(
          createBotClient().clickInventorySlot(
            create(BotInventoryClickRequestSchema, {
              instanceId,
              botId,
              expectedMenuId: menuId,
              slot,
              clickType,
              hotbarSlot: 0,
            }),
          ),
        ),
      ),
  });

  const { mutate: mutateClose } = useMutation({
    ...containerMutation("close"),
    mutationFn: async () =>
      requireSuccess(
        await Effect.runPromise(
          createBotClient().closeContainer({
            instanceId,
            botId,
            expectedMenuId: menuId,
          }),
        ),
      ),
  });

  // Stonecutter recipes, trades, lectern pages, and similar buttons.
  const { mutate: mutateButtonClick } = useMutation({
    ...containerMutation("button"),
    mutationFn: async (buttonId: number) =>
      requireSuccess(
        await Effect.runPromise(
          createBotClient().clickContainerButton(
            create(BotContainerButtonClickRequestSchema, {
              instanceId,
              botId,
              expectedMenuId: menuId,
              buttonId,
            }),
          ),
        ),
      ),
  });

  // Anvil rename, creative search, and similar text fields.
  const { mutate: mutateSetText } = useMutation({
    ...containerMutation("text"),
    mutationFn: async ({ fieldId, text }: { fieldId: string; text: string }) =>
      requireSuccess(
        await Effect.runPromise(
          createBotClient().setContainerText(
            create(BotSetContainerTextRequestSchema, {
              instanceId,
              botId,
              expectedMenuId: menuId,
              fieldId,
              text,
            }),
          ),
        ),
      ),
  });

  // Hotbar selection is bot-wide, so it keeps its own queue across menu changes.
  const { mutate: mutateSetHotbarSlot } = useMutation({
    mutationKey: ["bot", "hotbar", "slot", instanceId, botId],
    scope: { id: `bot-container-${instanceId}-${botId}` },
    mutationFn: async (slot: number) =>
      requireSuccess(
        await Effect.runPromise(
          createBotClient().setHotbarSlot({ instanceId, botId, slot }),
        ),
      ),
    onError: (error) => {
      toastError(t("bots.inventoryPanel.actionError"), error);
    },
    onSettled: () => {
      void refetch();
    },
  });

  const layout = isOnline ? inventoryState?.layout : undefined;
  const carriedItem = inventoryState?.carriedItem;
  const carriedItemImageSrc = carriedItem
    ? inventoryItemImageSrc(carriedItem)
    : undefined;
  const slots = inventoryState?.slots ?? [];

  if (!inventoryState || !layout) {
    return (
      <BotPanel icon={PackageIcon} title={t("bots.inventoryPanel.title")}>
        <BotPanelEmpty>
          {!isOnline
            ? t("bots.inventoryPanel.offline")
            : demo
              ? t("bots.inventoryPanel.demo")
              : t("bots.inventoryPanel.waiting")}
        </BotPanelEmpty>
      </BotPanel>
    );
  }

  const slotByIndex = new Map(slots.map((slot) => [slot.slot, slot]));
  const isCreative = layout.containerType === "creative";
  const hasCatalog =
    isCreative && layout.regions.some((r) => r.id === CREATIVE_CATALOG);
  const hasTrash =
    isCreative && layout.regions.some((r) => r.id === CREATIVE_TRASH);
  // Middle click only does something in the creative catalog. The numbers
  // below the hotbar already select the held slot.
  const activeClickMode =
    clickMode === "middle" && !hasCatalog ? "left" : clickMode;
  const anvilInputItem =
    layout.containerType === "anvil" ? slotByIndex.get(0) : undefined;

  return (
    <BotPanel
      icon={PackageIcon}
      title={layout.title || t("bots.inventoryPanel.title")}
      actions={
        <>
          {carriedItem && (
            <Badge
              variant="default"
              title={carriedItem.tooltipLines.join("\n") || undefined}
            >
              <HandIcon data-icon="inline-start" />
              <span className="sr-only">
                {t("bots.inventoryPanel.carrying")}
              </span>
              {carriedItemImageSrc && (
                <img
                  src={carriedItemImageSrc}
                  alt=""
                  draggable={false}
                  className="size-4 object-contain [image-rendering:pixelated]"
                />
              )}
              {t("bots.inventoryPanel.stack", {
                name: itemName(carriedItem),
                count: carriedItem.count,
              })}
            </Badge>
          )}
          {slots.length > 0 && (
            <Badge variant="outline">
              {t("bots.inventoryPanel.itemCount", { count: slots.length })}
            </Badge>
          )}
          {layout.containerType !== "inventory" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                mutateClose();
              }}
              disabled={isPending}
            >
              <XIcon data-icon="inline-start" />
              {t("bots.inventoryPanel.closeContainer")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ToggleGroup
          aria-label={t("bots.inventoryPanel.clickMode.label")}
          value={[activeClickMode]}
          onValueChange={(value) => {
            const next = value[0];
            if (
              next === "left" ||
              next === "right" ||
              next === "shift" ||
              next === "middle"
            )
              setClickMode(next);
          }}
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap"
        >
          {(["left", "right", "shift", "middle"] as const)
            .filter((mode) => mode !== "middle" || hasCatalog)
            .map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {t(`bots.inventoryPanel.clickMode.${mode}`)}
              </ToggleGroupItem>
            ))}
        </ToggleGroup>

        {layout.regions.map((region) => (
          <SlotRegionGrid
            key={region.id}
            region={region}
            slotByIndex={slotByIndex}
            selectedHotbarSlot={inventoryState.selectedHotbarSlot}
            clickMode={activeClickMode}
            hintsId={hintsId}
            isCreative={isCreative}
            onSlotClick={(slot, clickType) => {
              mutateClick({ slot, clickType });
            }}
            onHotbarSlotSelect={(slot) => {
              mutateSetHotbarSlot(slot);
            }}
          />
        ))}

        {layout.buttons.length > 0 && (
          <ContainerButtonsPanel
            buttons={layout.buttons}
            containerType={layout.containerType}
            onButtonClick={mutateButtonClick}
            isPending={isPending}
          />
        )}

        {layout.textInputs.length > 0 && (
          <ContainerTextInputPanel
            key={JSON.stringify([
              menuId,
              layout.containerType,
              anvilInputItem?.itemId,
              anvilInputItem?.count,
              anvilInputItem?.displayName,
            ])}
            textInputs={layout.textInputs}
            containerType={layout.containerType}
            onSetText={(fieldId, text) => {
              mutateSetText({ fieldId, text });
            }}
            isPending={isPending}
          />
        )}

        {layout.bookPages.length > 0 && (
          <BookPagesPanel
            pages={layout.bookPages}
            currentPage={layout.currentBookPage}
            onPageChange={mutateButtonClick}
          />
        )}

        {/* Clicking outside the window drops the carried stack. */}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-dashed border-destructive/30 p-3">
          <Trash2Icon className="size-4 text-muted-foreground" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              mutateClick({ slot: -999, clickType: ClickType.RIGHT_CLICK });
            }}
            disabled={!carriedItem}
          >
            {t("bots.inventoryPanel.dropOne")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              mutateClick({ slot: -999, clickType: ClickType.LEFT_CLICK });
            }}
            disabled={!carriedItem}
          >
            {t("bots.inventoryPanel.dropAll")}
          </Button>
        </div>

        <div
          id={hintsId}
          className="flex flex-col gap-1 text-center text-xs text-muted-foreground"
        >
          <p>
            {hasCatalog
              ? t("bots.inventoryPanel.creativeCatalogHint")
              : t("bots.inventoryPanel.clickHint")}
          </p>
          {hasTrash && <p>{t("bots.inventoryPanel.creativeTrashHint")}</p>}
          <p>{t("bots.inventoryPanel.keyboardHint")}</p>
        </div>
      </div>
    </BotPanel>
  );
}

function SlotRegionGrid({
  region,
  slotByIndex,
  selectedHotbarSlot,
  clickMode,
  hintsId,
  isCreative,
  onSlotClick,
  onHotbarSlotSelect,
}: {
  region: SlotRegion;
  slotByIndex: ReadonlyMap<number, InventorySlot>;
  selectedHotbarSlot: number;
  clickMode: SlotClickKind;
  hintsId: string;
  isCreative: boolean;
  onSlotClick: (slotIndex: number, clickType: ClickType) => void;
  onHotbarSlotSelect: (slot: number) => void;
}) {
  const { t } = useTranslation("instance");
  const isHotbar = region.type === SlotRegionType.SLOT_REGION_HOTBAR;
  const isCatalog = isCreative && region.id === CREATIVE_CATALOG;
  const isTrash = isCreative && region.id === CREATIVE_TRASH;

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {region.type === SlotRegionType.SLOT_REGION_ARMOR && (
          <ShieldIcon className="size-3" />
        )}
        {region.label}
        {region.type === SlotRegionType.SLOT_REGION_OUTPUT && (
          <span className="text-muted-foreground/50">
            {t("bots.inventoryPanel.output")}
          </span>
        )}
      </p>
      <div
        className="inline-grid w-fit grid-cols-[repeat(var(--slot-columns),2rem)] gap-1"
        style={{ "--slot-columns": region.columns }}
      >
        {Array.from({ length: region.slotCount }, (_, i) => {
          const slotIndex = region.startIndex + i;
          return (
            <InventorySlotButton
              key={`${region.id}-${slotIndex}`}
              item={slotByIndex.get(slotIndex)}
              isSelected={isHotbar && i === selectedHotbarSlot}
              hotbarNumber={isHotbar ? i + 1 : undefined}
              isClickable={region.type !== SlotRegionType.SLOT_REGION_DISPLAY}
              isTrash={isTrash}
              clickMode={clickMode}
              hintsId={hintsId}
              debugInfo={
                import.meta.env.DEV
                  ? { slotIndex, regionId: region.id, hotbarIndex: i }
                  : undefined
              }
              onClick={(kind) => {
                if (kind !== "middle")
                  onSlotClick(slotIndex, CLICK_TYPES[kind]);
                else if (isCatalog)
                  onSlotClick(slotIndex, ClickType.MIDDLE_CLICK);
                else if (isHotbar) onHotbarSlotSelect(i);
              }}
            />
          );
        })}
      </div>
      {isHotbar && (
        <ToggleGroup
          aria-label={t("bots.inventoryPanel.heldSlot")}
          value={[String(selectedHotbarSlot)]}
          onValueChange={(value) => {
            const next = value[0];
            if (next !== undefined) onHotbarSlotSelect(Number(next));
          }}
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap"
        >
          {Array.from({ length: region.slotCount }, (_, i) => (
            <ToggleGroupItem
              key={`${region.id}-held-${region.startIndex + i}`}
              value={String(i)}
              aria-label={t("bots.inventoryPanel.holdSlot", { slot: i + 1 })}
              title={t("bots.inventoryPanel.holdSlot", { slot: i + 1 })}
              className="w-8"
            >
              {i + 1}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

function InventorySlotButton({
  item,
  isSelected,
  hotbarNumber,
  isClickable,
  isTrash,
  clickMode,
  hintsId,
  debugInfo,
  onClick,
}: {
  item: InventorySlot | undefined;
  isSelected: boolean;
  hotbarNumber: number | undefined;
  isClickable: boolean;
  isTrash: boolean;
  clickMode: SlotClickKind;
  hintsId: string;
  debugInfo:
    | { slotIndex: number; regionId: string; hotbarIndex: number }
    | undefined;
  onClick: (kind: SlotClickKind) => void;
}) {
  const { t } = useTranslation("instance");
  const label = item
    ? t("bots.inventoryPanel.stack", {
        name: itemName(item),
        count: item.count,
      })
    : isTrash
      ? t("bots.inventoryPanel.destroyItem")
      : t("bots.inventoryPanel.emptySlot");
  // The tooltip adds the item's lore. Slot internals only help developers.
  const title = [
    label,
    ...(item?.tooltipLines.slice(1) ?? []),
    ...(debugInfo
      ? [
          "",
          t("bots.inventoryPanel.slotInfo.slot", {
            value: debugInfo.slotIndex,
          }),
          ...(item
            ? [t("bots.inventoryPanel.slotInfo.item", { value: item.itemId })]
            : []),
          t("bots.inventoryPanel.slotInfo.region", {
            value: debugInfo.regionId,
          }),
          ...(hotbarNumber === undefined
            ? []
            : [
                t("bots.inventoryPanel.slotInfo.hotbar", {
                  value: hotbarNumber,
                }),
              ]),
        ]
      : []),
  ].join("\n");
  const itemImageSrc = item ? inventoryItemImageSrc(item) : undefined;

  return (
    <button
      type="button"
      className={cn(
        "relative flex size-8 items-center justify-center overflow-hidden rounded-sm border border-border text-xs transition-colors",
        item ? "bg-muted" : "bg-muted/50",
        isSelected && "ring-2 ring-primary",
        isClickable && "cursor-pointer hover:border-primary/50",
      )}
      onClick={(event) => {
        event.preventDefault();
        onClick(slotPrimaryClick(event, clickMode));
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClick(slotContextMenuClick(event));
      }}
      onMouseDown={(event) => {
        // Stop the browser's middle-click autoscroll.
        if (event.button === 1) {
          event.preventDefault();
          onClick("middle");
        }
      }}
      onKeyDown={(event) => {
        // The native contextmenu event covers right clicks from the keyboard.
        const action = slotKeyAction(event);
        if (action === undefined) return;
        event.preventDefault();
        onClick(action);
      }}
      disabled={!isClickable}
      aria-label={label}
      aria-describedby={isClickable ? hintsId : undefined}
      title={title}
    >
      {item ? (
        <>
          {itemImageSrc ? (
            <img
              src={itemImageSrc}
              alt=""
              draggable={false}
              className="size-full object-contain p-0.5 [image-rendering:pixelated]"
            />
          ) : (
            <span
              aria-hidden="true"
              className="max-w-full truncate px-0.5 text-center text-3xs/tight"
            >
              {formatItemId(item.itemId).slice(0, 6)}
            </span>
          )}
          {item.count > 1 && (
            <span
              aria-hidden="true"
              className="absolute right-0.5 bottom-0 text-4xs font-bold"
            >
              {item.count}
            </span>
          )}
        </>
      ) : isTrash ? (
        <Trash2Icon className="size-4 text-muted-foreground" />
      ) : (
        hotbarNumber !== undefined && (
          <span aria-hidden="true" className="text-muted-foreground/30">
            {hotbarNumber}
          </span>
        )
      )}
    </button>
  );
}

const CONTAINER_BUTTON_TITLES: Partial<Record<string, string>> = {
  creative: "creativeTabs",
  stonecutter: "stonecutterRecipes",
  enchanting: "enchantments",
  loom: "patterns",
  merchant: "trades",
  beacon: "beaconEffects",
  crafter: "crafterSlots",
  lectern: "lecternControls",
};

function ContainerButtonsPanel({
  buttons,
  containerType,
  onButtonClick,
  isPending,
}: {
  buttons: ContainerButton[];
  containerType: string;
  onButtonClick: (buttonId: number) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation("instance");
  const titleId = useId();
  const titleKey = CONTAINER_BUTTON_TITLES[containerType] ?? "actions";

  return (
    <div className="flex flex-col gap-2">
      <div id={titleId} className="text-sm font-medium text-muted-foreground">
        {t(`bots.inventoryPanel.buttons.${titleKey}`)}
      </div>
      <ToggleGroup
        multiple
        aria-labelledby={titleId}
        value={buttons
          .filter((button) => button.selected)
          .map((button) => String(button.buttonId))}
        onValueChange={(value) => {
          const nextSelection = new Set(value);
          const changedButton = buttons.find(
            (button) =>
              nextSelection.has(String(button.buttonId)) !== button.selected,
          );
          if (changedButton) onButtonClick(changedButton.buttonId);
        }}
        variant="outline"
        size="sm"
        spacing={1}
        className="max-h-48 w-full flex-wrap overflow-y-auto rounded-lg border p-2"
      >
        {buttons.map((button) => (
          <ToggleGroupItem
            key={button.buttonId}
            value={String(button.buttonId)}
            className="h-auto min-w-0 shrink-0 px-2 py-1 text-xs"
            disabled={isPending || button.disabled}
            title={button.description || undefined}
          >
            {button.iconItemId && containerType !== "creative" && (
              <span className="mr-1 font-mono text-3xs opacity-60">
                {formatItemId(button.iconItemId)}
              </span>
            )}
            {button.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function ContainerTextInputPanel({
  textInputs,
  containerType,
  onSetText,
  isPending,
}: {
  textInputs: ContainerTextInput[];
  containerType: string;
  onSetText: (fieldId: string, text: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation("instance");
  const title =
    containerType === "anvil"
      ? t("bots.inventoryPanel.textInput.anvilRename")
      : containerType === "creative"
        ? t("bots.inventoryPanel.textInput.creativeSearch")
        : t("bots.inventoryPanel.textInput.title");

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="rounded-lg border p-2">
        <FieldGroup className="gap-2">
          {textInputs.map((input) => (
            <ContainerTextInputField
              key={input.id}
              input={input}
              onSetText={onSetText}
              isPending={isPending}
            />
          ))}
        </FieldGroup>
      </div>
    </div>
  );
}

function ContainerTextInputField({
  input,
  onSetText,
  isPending,
}: {
  input: ContainerTextInput;
  onSetText: (fieldId: string, text: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const composition = useRef<{
    value: string;
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
  } | null>(null);
  const [draft, setDraft] = useState(() =>
    createServerInputDraft(input.currentValue),
  );
  const current = syncServerInputDraft(draft, input.currentValue);
  if (current !== draft) setDraft(current);

  const insertText = (element: HTMLInputElement, text: string) => {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const insertion = editBoxInsertion(
      element.value,
      text,
      start,
      end,
      input.maxLength,
    );
    element.setRangeText(insertion, start, end, "end");
    setDraft(editServerInputDraft(current, element.value, isPending));
  };

  const handleBeforeInput = useEffectEvent((event: InputEvent) => {
    const element = fieldRef.current;
    if (
      !element ||
      !event.cancelable ||
      composition.current ||
      event.isComposing ||
      event.data === null
    )
      return;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const insertion = editBoxInsertion(
      element.value,
      event.data,
      start,
      end,
      input.maxLength,
    );
    if (insertion === event.data) return;
    event.preventDefault();
    if (editBoxValue(event.data, 0)) insertText(element, event.data);
  });

  useEffect(() => {
    const element = fieldRef.current;
    if (!element) return undefined;
    const beforeInput = (event: InputEvent) => {
      handleBeforeInput(event);
    };
    element.addEventListener("beforeinput", beforeInput);
    return () => {
      element.removeEventListener("beforeinput", beforeInput);
    };
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!isPending && !composition.current)
          onSetText(input.id, current.value);
      }}
    >
      <Field>
        <FieldLabel htmlFor={id} className="sr-only">
          {input.label}
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            ref={fieldRef}
            id={id}
            placeholder={input.placeholder || input.label}
            value={current.value}
            maxLength={input.maxLength > 0 ? input.maxLength : undefined}
            onCompositionStart={(event) => {
              const element = event.currentTarget;
              const start = element.selectionStart ?? element.value.length;
              composition.current = {
                value: element.value,
                start,
                end: element.selectionEnd ?? start,
                direction: element.selectionDirection ?? "none",
              };
            }}
            onCompositionEnd={(event) => {
              const before = composition.current;
              composition.current = null;
              if (!before) return;
              const element = event.currentTarget;
              // A browser can clip the commit but leave the caret after the
              // full preedit. Apply the native insertion to its original range.
              element.value = before.value;
              element.setSelectionRange(
                before.start,
                before.end,
                before.direction,
              );
              if (event.data) insertText(element, event.data);
              else
                setDraft(
                  editServerInputDraft(current, before.value, isPending),
                );
            }}
            onPaste={(event) => {
              event.preventDefault();
              insertText(
                event.currentTarget,
                event.clipboardData.getData("text/plain"),
              );
            }}
            onChange={(event) => {
              setDraft(
                editServerInputDraft(
                  current,
                  composition.current
                    ? event.target.value
                    : editBoxValue(event.target.value, 0),
                  isPending,
                ),
              );
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              size="icon-xs"
              disabled={isPending}
              aria-label={t("save")}
              title={t("save")}
            >
              <PencilIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </form>
  );
}

// Lectern button IDs from the vanilla LecternMenu.
const LECTERN_PREVIOUS_PAGE = 1;
const LECTERN_NEXT_PAGE = 2;

/** The open lectern book. The server owns the current page. */
function BookPagesPanel({
  pages,
  currentPage,
  onPageChange,
}: {
  pages: BookPage[];
  currentPage: number;
  onPageChange: (buttonId: number) => void;
}) {
  const { t } = useTranslation("instance");
  const content = pages.find((p) => p.pageNumber === currentPage)?.content;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <BookOpenIcon className="size-4" />
        {t("bots.inventoryPanel.bookPages.title")}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="min-h-[100px] rounded-sm bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap select-text">
          {content || t("bots.inventoryPanel.bookPages.emptyPage")}
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("bots.inventoryPanel.bookPages.previousPage")}
            onClick={() => {
              onPageChange(LECTERN_PREVIOUS_PAGE);
            }}
            disabled={currentPage <= 0}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("bots.inventoryPanel.bookPages.pageIndicator", {
              current: currentPage + 1,
              total: pages.length,
            })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("bots.inventoryPanel.bookPages.nextPage")}
            onClick={() => {
              onPageChange(LECTERN_NEXT_PAGE);
            }}
            disabled={currentPage >= pages.length - 1}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

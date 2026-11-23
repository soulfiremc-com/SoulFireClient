import { ChevronDownIcon, GripVerticalIcon, SearchIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { cn } from "@/lib/utils.tsx";
import { useNodeTypes } from "./node-types-context";
import type { CategoryInfo, NodeDefinition } from "./nodes/types.ts";

/** Drops a dragged node at a screen position. */
type NodeDropHandler = (nodeType: string, x: number, y: number) => void;

interface NodePaletteProps {
  /** Lets nodes be dragged onto the canvas. Without it, nodes are tap-to-add buttons. */
  onNodeDrop?: NodeDropHandler | undefined;
  /** Adds the node at the canvas center. */
  onNodeAdd: (nodeType: string) => void;
  className?: string;
}

interface DraggableNodeItemProps {
  node: NodeDefinition;
  nodeLabel: string;
  onDrop?: NodeDropHandler | undefined;
  onAdd: (nodeType: string) => void;
}

/** A press only turns into a drag after the pointer moves this far. */
const DRAG_THRESHOLD_PX = 5;

const ITEM_CLASS =
  "group flex items-center gap-2 rounded-md border border-transparent bg-muted/50 px-2 py-1.5 text-sm transition-colors select-none hover:border-border hover:bg-muted";

function DraggableNodeItem({
  node,
  nodeLabel,
  onDrop,
  onAdd,
}: DraggableNodeItemProps) {
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  if (!onDrop) {
    // Mobile mode: tap to add instead of drag
    return (
      <button
        type="button"
        title={node.description}
        onClick={() => {
          onAdd(node.type);
        }}
        className={cn(ITEM_CLASS, "cursor-pointer")}
      >
        <DynamicIcon name={node.icon} className="size-4 shrink-0" />
        <span className="truncate">{nodeLabel}</span>
      </button>
    );
  }

  // The preview follows the pointer without re-rendering on every move.
  const placePreview = () => {
    const { x, y } = pointerRef.current;
    previewRef.current?.style.setProperty(
      "transform",
      `translate(${x}px, ${y}px) translate(-50%, -50%)`,
    );
  };

  const endGesture = () => {
    gestureRef.current = null;
    setDragging(false);
  };

  // A drop on the canvas places the node there. A click or Enter without a
  // drag adds it at the canvas center. Pointer capture keeps the gesture on
  // this button, so a cancelled touch can never leave a drag behind.
  return (
    <>
      <button
        type="button"
        title={node.description}
        onPointerDown={(e) => {
          suppressClickRef.current = false;
          if (e.button !== 0 || !e.isPrimary) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          gestureRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
          };
        }}
        onPointerMove={(e) => {
          const gesture = gestureRef.current;
          if (gesture?.pointerId !== e.pointerId) return;
          pointerRef.current = { x: e.clientX, y: e.clientY };
          if (dragging) {
            placePreview();
          } else if (
            Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) >
            DRAG_THRESHOLD_PX
          ) {
            setDragging(true);
          }
        }}
        onPointerUp={(e) => {
          if (gestureRef.current?.pointerId !== e.pointerId) return;
          const dragged = dragging;
          endGesture();
          if (dragged) {
            suppressClickRef.current = true;
            onDrop(node.type, e.clientX, e.clientY);
          }
        }}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
        onKeyDown={(e) => {
          if (e.key === "Escape" && gestureRef.current) {
            e.preventDefault();
            suppressClickRef.current = true;
            endGesture();
          }
        }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onAdd(node.type);
        }}
        // Vertical swipes still scroll the palette. A sideways drag moves
        // the node toward the canvas.
        className={cn(
          ITEM_CLASS,
          "cursor-grab touch-pan-y active:cursor-grabbing",
        )}
      >
        <GripVerticalIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        <DynamicIcon name={node.icon} className="size-4 shrink-0" />
        <span className="truncate">{nodeLabel}</span>
      </button>
      {dragging &&
        createPortal(
          <div
            ref={(element) => {
              previewRef.current = element;
              placePreview();
            }}
            aria-hidden
            className="pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-2 rounded-md border border-border bg-muted/90 px-2 py-1.5 text-sm shadow-md"
          >
            <DynamicIcon name={node.icon} className="size-4 shrink-0" />
            <span className="truncate">{nodeLabel}</span>
          </div>,
          document.body,
        )}
    </>
  );
}

interface CategorySectionProps {
  categoryName: string;
  categoryInfo: CategoryInfo;
  nodes: NodeDefinition[];
  forceOpen: boolean;
  onNodeDrop?: NodeDropHandler | undefined;
  onNodeAdd: (nodeType: string) => void;
}

function CategorySection({
  categoryName,
  categoryInfo,
  nodes,
  forceOpen,
  onNodeDrop,
  onNodeAdd,
}: CategorySectionProps) {
  const [userOpen, setUserOpen] = useState(true);
  // Search results stay visible even in a category the user collapsed.
  const isOpen = forceOpen || userOpen;

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setUserOpen}>
      <CollapsibleTrigger
        title={categoryInfo.description}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !isOpen && "-rotate-90",
          )}
        />
        <DynamicIcon
          name={categoryInfo.icon}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex-1 text-left">{categoryName}</span>
        <span className="text-xs text-muted-foreground">{nodes.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 flex flex-col gap-1 border-l border-border pt-1 pl-2">
          {nodes.map((node) => (
            <DraggableNodeItem
              key={node.type}
              node={node}
              nodeLabel={node.label}
              onDrop={onNodeDrop}
              onAdd={onNodeAdd}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NodePalette({
  onNodeDrop,
  onNodeAdd,
  className,
}: NodePaletteProps) {
  const { t } = useTranslation("instance");
  const {
    categories,
    getNodesByCategory,
    getCategoryInfo: getContextCategoryInfo,
  } = useNodeTypes();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNodesByCategory = useMemo(() => {
    const result: Record<string, NodeDefinition[]> = {};

    const query = searchQuery.toLowerCase().trim();

    for (const category of categories) {
      const nodes = getNodesByCategory(category);
      if (query) {
        result[category] = nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query) ||
            node.keywords?.some((kw) => kw.toLowerCase().includes(query)),
        );
      } else {
        result[category] = nodes;
      }
    }

    return result;
  }, [searchQuery, categories, getNodesByCategory]);

  const totalFilteredNodes = useMemo(
    () =>
      Object.values(filteredNodesByCategory).reduce(
        (sum, nodes) => sum + nodes.length,
        0,
      ),
    [filteredNodesByCategory],
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border bg-card",
        className,
      )}
    >
      <div className="border-b border-border p-3">
        <h2 className="mb-2 text-sm font-semibold">
          {t("scripts.editor.palette.title")}
        </h2>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={t("scripts.editor.palette.search")}
            placeholder={t("scripts.editor.palette.search")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
          />
        </InputGroup>
        {searchQuery && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("scripts.nodes", { count: totalFilteredNodes })}
          </p>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {categories.map((category) => {
            const info = getContextCategoryInfo(category);
            return (
              <CategorySection
                key={category}
                categoryName={info.name}
                categoryInfo={info}
                nodes={filteredNodesByCategory[category] ?? []}
                forceOpen={searchQuery.trim() !== ""}
                onNodeDrop={onNodeDrop}
                onNodeAdd={onNodeAdd}
              />
            );
          })}
          {searchQuery && totalFilteredNodes === 0 && (
            <Empty className="border-0 p-6">
              <EmptyHeader>
                <EmptyTitle>{t("scripts.editor.palette.noResults")}</EmptyTitle>
                <EmptyDescription>
                  {t("scripts.editor.palette.noResultsDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

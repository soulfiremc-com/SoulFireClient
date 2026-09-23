import { ChevronDownIcon, GripVerticalIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { useNodeTypes } from "./NodeTypesContext";
import type { CategoryInfo, NodeDefinition } from "./nodes/types.ts";
import { useNodeTranslations } from "./useNodeTranslations";

interface NodePaletteProps {
  onNodeDragStart?: (nodeType: string, x: number, y: number) => void;
  onNodeTap?: (nodeType: string) => void;
  className?: string;
}

interface DraggableNodeItemProps {
  node: NodeDefinition;
  nodeLabel: string;
  onDragStart?: (nodeType: string, x: number, y: number) => void;
  onTap?: (nodeType: string) => void;
}

function DraggableNodeItem({
  node,
  nodeLabel,
  onDragStart,
  onTap,
}: DraggableNodeItemProps) {
  if (onTap) {
    // Mobile mode: tap to add instead of drag
    return (
      <button
        type="button"
        title={node.description}
        onClick={() => onTap(node.type)}
        className="group flex cursor-pointer items-center gap-2 rounded-md border border-transparent bg-muted/50 px-2 py-1.5 text-sm select-none transition-colors hover:border-border hover:bg-muted"
      >
        <DynamicIcon name={node.icon} className="size-4 shrink-0" />
        <span className="truncate">{nodeLabel}</span>
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title={node.description}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onDragStart?.(node.type, e.clientX, e.clientY);
      }}
      className="group flex cursor-grab items-center gap-2 rounded-md border border-transparent bg-muted/50 px-2 py-1.5 text-sm select-none transition-colors hover:border-border hover:bg-muted active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      <DynamicIcon name={node.icon} className="size-4 shrink-0" />
      <span className="truncate">{nodeLabel}</span>
    </div>
  );
}

interface CategorySectionProps {
  categoryName: string;
  categoryInfo: CategoryInfo;
  nodes: NodeDefinition[];
  getNodeLabel: (node: NodeDefinition) => string;
  defaultOpen?: boolean;
  onNodeDragStart?: (nodeType: string, x: number, y: number) => void;
  onNodeTap?: (nodeType: string) => void;
}

function CategorySection({
  categoryName,
  categoryInfo,
  nodes,
  getNodeLabel,
  defaultOpen = true,
  onNodeDragStart,
  onNodeTap,
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
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
        <div className="ml-4 flex flex-col gap-1 border-l border-border pl-2 pt-1">
          {nodes.map((node) => (
            <DraggableNodeItem
              key={node.type}
              node={node}
              nodeLabel={getNodeLabel(node)}
              onDragStart={onNodeDragStart}
              onTap={onNodeTap}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NodePalette({
  onNodeDragStart,
  onNodeTap,
  className,
}: NodePaletteProps) {
  const { t } = useTranslation("instance");
  const { getNodeLabel, getCategoryName } = useNodeTranslations();
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
            getNodeLabel(node).toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query) ||
            node.keywords?.some((kw) => kw.toLowerCase().includes(query)),
        );
      } else {
        result[category] = nodes;
      }
    }

    return result;
  }, [searchQuery, getNodeLabel, categories, getNodesByCategory]);

  const totalFilteredNodes = useMemo(() => {
    return Object.values(filteredNodesByCategory).reduce(
      (sum, nodes) => sum + nodes.length,
      0,
    );
  }, [filteredNodesByCategory]);

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
            placeholder={t("scripts.editor.palette.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
                categoryName={getCategoryName(category, info.name)}
                categoryInfo={info}
                nodes={filteredNodesByCategory[category] ?? []}
                getNodeLabel={getNodeLabel}
                defaultOpen={!searchQuery}
                onNodeDragStart={onNodeDragStart}
                onNodeTap={onNodeTap}
              />
            );
          })}
          {searchQuery && totalFilteredNodes === 0 && (
            <Empty className="border-0 p-6">
              <EmptyHeader>
                <EmptyTitle>
                  {t(
                    "scripts.editor.palette.noResults",
                    "No nodes match your search",
                  )}
                </EmptyTitle>
                <EmptyDescription>
                  {t(
                    "scripts.editor.palette.noResultsDescription",
                    "Try a different term or clear the current filter.",
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

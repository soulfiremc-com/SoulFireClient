"use client";

import { GripVertical, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@/components/ui/sortable";
import { cn } from "@/lib/utils";

export interface MultiInputOrderItem {
  id: string;
  index: number;
  label: string;
  sublabel?: string;
}

interface MultiInputOrderListProps {
  items: MultiInputOrderItem[];
  onReorder: (orderedEdgeIds: string[]) => void;
  compact?: boolean;
  emptyLabel?: string;
}

function ItemCard({
  item,
  compact = false,
  showHandle = false,
  className,
}: {
  item: MultiInputOrderItem;
  compact?: boolean;
  showHandle?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-md border border-border/70 bg-background/95 text-xs shadow-sm",
        compact ? "px-1.5 py-1" : "px-2 py-1.5",
        className,
      )}
    >
      <Badge
        variant="secondary"
        className="h-5 min-w-5 rounded-full px-1 font-mono text-3xs"
      >
        {item.index}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground">{item.label}</div>
        {item.sublabel && (
          <div className="truncate text-2xs text-muted-foreground">
            {item.sublabel}
          </div>
        )}
      </div>
      {showHandle && (
        <SortableItemHandle
          className={cn(
            "nodrag nopan inline-flex size-6 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            compact && "size-5",
          )}
          aria-label={`Reorder ${item.label}`}
        >
          <GripVertical className={compact ? "size-3" : "size-3.5"} />
        </SortableItemHandle>
      )}
    </div>
  );
}

export function MultiInputOrderList({
  items,
  onReorder,
  compact = false,
  emptyLabel = "No incoming values",
}: MultiInputOrderListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-muted/20 px-2 py-1 text-2xs text-muted-foreground">
        <Link2 className="size-3" />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <Sortable
      value={items}
      getItemValue={(item) => item.id}
      onValueChange={(nextItems) => onReorder(nextItems.map((item) => item.id))}
    >
      <SortableContent className="flex w-full flex-col gap-1.5">
        {items.map((item) => (
          <SortableItem
            key={item.id}
            value={item.id}
            className="nodrag nopan w-full"
          >
            <ItemCard
              item={item}
              compact={compact}
              showHandle
              className="data-dragging:border-primary/40 data-dragging:bg-muted/60"
            />
          </SortableItem>
        ))}
      </SortableContent>
      <SortableOverlay>
        {({ value }) => {
          const item = items.find((entry) => entry.id === value);
          return item ? (
            <ItemCard
              item={item}
              compact={compact}
              className="w-[220px] border-primary/40 bg-card shadow-lg"
            />
          ) : null;
        }}
      </SortableOverlay>
    </Sortable>
  );
}

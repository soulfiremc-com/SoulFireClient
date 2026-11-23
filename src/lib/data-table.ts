import type { Column, RowData } from "@tanstack/react-table";
import type { dataTableFeatures } from "@/lib/data-table-features";

export function getColumnPinningStyle<TData extends RowData>({
  column,
}: {
  column: Column<typeof dataTableFeatures, TData>;
}): React.CSSProperties {
  const isPinned = column.getIsPinned();
  if (!isPinned) return { width: column.getSize() };

  // Only pinned cells get a background, since an opaque cell would hide the
  // row's hover and selection colors.
  return {
    insetInlineStart:
      isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    insetInlineEnd:
      isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    opacity: 0.97,
    position: "sticky",
    background: "var(--background)",
    width: column.getSize(),
    zIndex: 1,
  };
}

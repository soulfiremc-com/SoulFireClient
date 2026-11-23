import type {
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import type { TableColumnMeta } from "@/types/data-table";

export function getTablePagination(
  page: number,
  pageSize: number,
  defaultPageSize = 10,
): PaginationState {
  const validDefault =
    Number.isSafeInteger(defaultPageSize) && defaultPageSize > 0
      ? defaultPageSize
      : 10;
  return {
    pageIndex: Number.isSafeInteger(page) && page > 0 ? page - 1 : 0,
    pageSize:
      Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : validDefault,
  };
}

export function getValidPageIndex(pageIndex: number, pageCount: number) {
  return pageCount >= 0 && pageIndex >= pageCount ? 0 : pageIndex;
}

export function getTableColumnFilters(
  values: Record<string, string | string[] | null>,
  columns: readonly { id?: string; meta?: TableColumnMeta }[],
): ColumnFiltersState {
  return Object.entries(values).flatMap(([id, value]) => {
    if (value === null) return [];
    const variant = columns.find((column) => column.id === id)?.meta?.variant;
    return [
      {
        id,
        value:
          typeof value === "string" &&
          (variant === "range" || variant === "dateRange")
            ? value.split(",")
            : value,
      },
    ];
  });
}

interface SelectableTable {
  getFilteredRowModel: () => {
    flatRows: readonly { id: string; getCanSelect: () => boolean }[];
  };
  setRowSelection: (
    updater: (old: RowSelectionState) => RowSelectionState,
  ) => void;
}

/**
 * Selects or clears every row that passes the current filters. Rows hidden by
 * a filter keep their state, so "select all" never picks rows the user cannot
 * see.
 */
export function setFilteredRowsSelected(
  table: SelectableTable,
  selected: boolean,
) {
  const ids = table
    .getFilteredRowModel()
    .flatRows.filter((row) => row.getCanSelect())
    .map((row) => row.id);
  table.setRowSelection((old) => {
    if (selected) {
      const next: RowSelectionState = { ...old };
      for (const id of ids) next[id] = true;
      return next;
    }
    const cleared = new Set(ids);
    return Object.fromEntries(
      Object.entries(old).filter(([id]) => !cleared.has(id)),
    );
  });
}

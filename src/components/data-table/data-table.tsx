import { useTranslation } from "react-i18next";
import {
  type Cell,
  FlexRender,
  type ReactTable,
  type Row,
  type RowData,
  type TableState,
} from "@tanstack/react-table";
import * as React from "react";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getColumnPinningStyle } from "@/lib/data-table";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";

interface DataTableProps<
  TData extends RowData,
> extends React.ComponentProps<"div"> {
  table: ReactTable<typeof dataTableFeatures, TData>;
  actionBar?: React.ReactNode;
  onRowContextMenu?: ((e: React.MouseEvent, row: TData) => void) | undefined;
}

// Every slice that changes which rows, cells, or header states render.
function selectRenderedState(state: TableState<typeof dataTableFeatures>) {
  // TanStack Table types the global filter as any.
  const globalFilter: unknown = state.globalFilter;
  return {
    columnFilters: state.columnFilters,
    columnOrder: state.columnOrder,
    columnPinning: state.columnPinning,
    columnVisibility: state.columnVisibility,
    globalFilter,
    pagination: state.pagination,
    rowSelection: state.rowSelection,
    sorting: state.sorting,
  };
}

interface DataTableRowProps<TData extends RowData> {
  row: Row<typeof dataTableFeatures, TData>;
  cells: Cell<typeof dataTableFeatures, TData>[];
  selected: boolean;
  onRowContextMenu?: ((e: React.MouseEvent, row: TData) => void) | undefined;
}

// Rows only re-render when their data, cells, or selection change, so
// toggling one checkbox does not re-render every cell on the page.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- React.memo drops the generic type parameter of the row component
const DataTableRow = React.memo(function DataTableRow<TData extends RowData>({
  row,
  cells,
  selected,
  onRowContextMenu,
}: DataTableRowProps<TData>) {
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      onContextMenu={
        onRowContextMenu
          ? (e) => {
              onRowContextMenu(e, row.original);
            }
          : undefined
      }
    >
      {cells.map((cell) => (
        <TableCell
          key={cell.id}
          style={getColumnPinningStyle({ column: cell.column })}
        >
          <FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  );
}) as <TData extends RowData>(
  props: DataTableRowProps<TData>,
) => React.ReactNode;

export function DataTable<TData extends RowData>({
  table,
  actionBar,
  onRowContextMenu,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  const { t } = useTranslation("common");
  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <div className="overflow-hidden rounded-md border">
        <table.Subscribe selector={selectRenderedState}>
          {() => {
            const rows = table.getRowModel().rows;
            return (
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          style={getColumnPinningStyle({
                            column: header.column,
                          })}
                        >
                          {header.isPlaceholder ? null : (
                            <FlexRender header={header} />
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <DataTableRow
                        key={row.id}
                        row={row}
                        cells={row.getVisibleCells()}
                        selected={row.getIsSelected()}
                        onRowContextMenu={onRowContextMenu}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={table.getAllColumns().length}
                        className="h-36 p-0"
                      >
                        <Empty className="h-full rounded-none border-0 px-4 py-8">
                          <EmptyHeader className="gap-1">
                            <EmptyTitle className="text-sm">
                              {t("dataTable.noResults")}
                            </EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            );
          }}
        </table.Subscribe>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination table={table} />
        {/* The action bar shows itself while rows are selected. */}
        {actionBar}
      </div>
    </div>
  );
}

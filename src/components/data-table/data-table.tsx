import type { ReactTable, RowData } from "@tanstack/react-table";
import type * as React from "react";
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

interface DataTableProps<TData extends RowData>
  extends React.ComponentProps<"div"> {
  table: ReactTable<typeof dataTableFeatures, TData>;
  actionBar?: React.ReactNode;
  onRowContextMenu?: (e: React.MouseEvent, row: TData) => void;
}

export function DataTable<TData extends RowData>({
  table,
  actionBar,
  onRowContextMenu,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getColumnPinningStyle({ column: header.column }),
                    }}
                  >
                    {header.isPlaceholder ? null : table.FlexRender({ header })}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onContextMenu={
                    onRowContextMenu
                      ? (e) => onRowContextMenu(e, row.original)
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getColumnPinningStyle({ column: cell.column }),
                      }}
                    >
                      {table.FlexRender({ cell })}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-36 p-0"
                >
                  <Empty className="h-full rounded-none border-0 px-4 py-8">
                    <EmptyHeader className="gap-1">
                      <EmptyTitle className="text-sm">No results.</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination table={table} />
        {actionBar ? (
          <table.Subscribe
            selector={(state) => ({
              columnFilters: state.columnFilters,
              rowSelection: state.rowSelection,
            })}
          >
            {() =>
              table.getFilteredSelectedRowModel().rows.length > 0
                ? actionBar
                : null
            }
          </table.Subscribe>
        ) : null}
      </div>
    </div>
  );
}

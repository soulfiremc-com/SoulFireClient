import type { ReactTable, RowData } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";

interface DataTablePaginationProps<TData extends RowData>
  extends React.ComponentProps<"div"> {
  table: ReactTable<typeof dataTableFeatures, TData>;
  pageSizeOptions?: number[];
}

export function DataTablePagination<TData extends RowData>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
  className,
  ...props
}: DataTablePaginationProps<TData>) {
  const rowsPerPageLabelId = useId();
  const pageSizeItems = pageSizeOptions.map((pageSize) => ({
    label: String(pageSize),
    value: String(pageSize),
  }));

  return (
    <div
      className={cn(
        "flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-8",
        className,
      )}
      {...props}
    >
      <table.Subscribe
        selector={(state) => ({
          columnFilters: state.columnFilters,
          rowSelection: state.rowSelection,
        })}
      >
        {() => (
          <div className="flex-1 whitespace-nowrap text-muted-foreground text-sm">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
        )}
      </table.Subscribe>
      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <table.Subscribe source={table.atoms.pagination}>
          {(pagination) => (
            <>
              <div className="flex items-center gap-2">
                <p
                  id={rowsPerPageLabelId}
                  className="whitespace-nowrap font-medium text-sm"
                >
                  Rows per page
                </p>
                <Select
                  value={`${pagination.pageSize}`}
                  onValueChange={(value) => {
                    table.setPageSize(Number(value));
                  }}
                  items={pageSizeItems}
                >
                  <SelectTrigger
                    aria-labelledby={rowsPerPageLabelId}
                    className="h-8 w-18 data-size:h-8"
                  >
                    <SelectValue placeholder={pagination.pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    <SelectGroup>
                      <SelectLabel>Rows per page</SelectLabel>
                      {pageSizeItems.map((pageSize) => (
                        <SelectItem key={pageSize.value} value={pageSize.value}>
                          {pageSize.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center font-medium text-sm">
                Page {pagination.pageIndex + 1} of {table.getPageCount()}
              </div>
            </>
          )}
        </table.Subscribe>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Go to first page"
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft />
          </Button>
          <Button
            aria-label="Go to previous page"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Go to next page"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight />
          </Button>
          <Button
            aria-label="Go to last page"
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

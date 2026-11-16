import i18n from "@/lib/i18n.ts";
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

interface DataTablePaginationProps<
  TData extends RowData,
> extends React.ComponentProps<"div"> {
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
    <table.Subscribe
      selector={(state) => ({
        columnFilters: state.columnFilters,
        globalFilter: state.globalFilter,
        pagination: state.pagination,
        rowSelection: state.rowSelection,
      })}
    >
      {({ pagination }) => (
        <div
          className={cn(
            "flex w-full flex-col gap-3 p-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-8",
            className,
          )}
          {...props}
        >
          <div className="text-muted-foreground text-sm">
            {i18n.t("common:dataTable.rowsSelected", {
              amount: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:justify-end lg:gap-x-8">
            <div className="flex items-center gap-2">
              <p
                id={rowsPerPageLabelId}
                className="whitespace-nowrap font-medium text-sm"
              >
                {i18n.t("common:dataTable.rowsPerPage")}
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
                    <SelectLabel>
                      {i18n.t("common:dataTable.rowsPerPage")}
                    </SelectLabel>
                    {pageSizeItems.map((pageSize) => (
                      <SelectItem key={pageSize.value} value={pageSize.value}>
                        {pageSize.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <div className="mr-2 whitespace-nowrap font-medium text-sm">
                {i18n.t("common:dataTable.currentPage", {
                  page: pagination.pageIndex + 1,
                  total: Math.max(table.getPageCount(), 1),
                })}
              </div>
              <Button
                aria-label={i18n.t("common:dataTable.goFirst")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.firstPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft />
              </Button>
              <Button
                aria-label={i18n.t("common:dataTable.goPrevious")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label={i18n.t("common:dataTable.goNext")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight />
              </Button>
              <Button
                aria-label={i18n.t("common:dataTable.goLast")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.lastPage()}
                disabled={!table.getCanLastPage()}
              >
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </table.Subscribe>
  );
}

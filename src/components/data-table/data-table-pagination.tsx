import { useTranslation } from "react-i18next";
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

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export function DataTablePagination<TData extends RowData>({
  table,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
  ...props
}: DataTablePaginationProps<TData>) {
  const { t } = useTranslation("common");
  const rowsPerPageLabelId = useId();
  const pageSizeItems = pageSizeOptions.map((pageSize) => ({
    label: String(pageSize),
    value: String(pageSize),
  }));

  return (
    <table.Subscribe
      selector={(state) => {
        // TanStack Table types the global filter as any.
        const globalFilter: unknown = state.globalFilter;
        return {
          columnFilters: state.columnFilters,
          globalFilter,
          pagination: state.pagination,
          rowSelection: state.rowSelection,
        };
      }}
    >
      {({ pagination }) => (
        <div
          className={cn(
            "flex w-full flex-col gap-3 p-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-8",
            className,
          )}
          {...props}
        >
          <div className="text-sm text-muted-foreground">
            {t("dataTable.rowsSelected", {
              selected: table.getFilteredSelectedRowModel().rows.length,
              count: table.getFilteredRowModel().rows.length,
              // Older translations use {{amount}} and {{total}}. Keep them
              // until Crowdin translates the plural forms.
              amount: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:justify-end lg:gap-x-8">
            <div className="flex items-center gap-2">
              <p
                id={rowsPerPageLabelId}
                className="text-sm font-medium whitespace-nowrap"
              >
                {t("dataTable.rowsPerPage")}
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
                    <SelectLabel>{t("dataTable.rowsPerPage")}</SelectLabel>
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
              <div className="mr-2 text-sm font-medium whitespace-nowrap">
                {t("dataTable.currentPage", {
                  page: pagination.pageIndex + 1,
                  total: Math.max(table.getPageCount(), 1),
                })}
              </div>
              <Button
                aria-label={t("dataTable.goFirst")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => {
                  table.firstPage();
                }}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft />
              </Button>
              <Button
                aria-label={t("dataTable.goPrevious")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => {
                  table.previousPage();
                }}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label={t("dataTable.goNext")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => {
                  table.nextPage();
                }}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight />
              </Button>
              <Button
                aria-label={t("dataTable.goLast")}
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => {
                  table.lastPage();
                }}
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

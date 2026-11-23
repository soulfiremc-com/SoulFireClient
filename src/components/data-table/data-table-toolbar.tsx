"use client";

import { useTranslation } from "react-i18next";
import type { Column, ReactTable, RowData } from "@tanstack/react-table";
import { X } from "lucide-react";
import * as React from "react";

import { DataTableDateFilter } from "@/components/data-table/data-table-date-filter";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { DataTableSliderFilter } from "@/components/data-table/data-table-slider-filter";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";

interface DataTableToolbarProps<
  TData extends RowData,
> extends React.ComponentProps<"div"> {
  table: ReactTable<typeof dataTableFeatures, TData>;
}

export function DataTableToolbar<TData extends RowData>({
  table,
  children,
  className,
  ...props
}: DataTableToolbarProps<TData>) {
  const { t } = useTranslation("common");
  const columns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  );

  const onReset = React.useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        "flex w-full flex-wrap items-start justify-between gap-2 p-1",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 basis-72 flex-wrap items-center gap-2">
        {columns.map((column) => (
          <table.Subscribe
            key={column.id}
            source={table.atoms.columnFilters}
            selector={(filters) =>
              filters.find((filter) => filter.id === column.id)?.value
            }
          >
            {() => <DataTableToolbarFilter column={column} />}
          </table.Subscribe>
        ))}
        <table.Subscribe source={table.atoms.columnFilters}>
          {(columnFilters) =>
            columnFilters.length > 0 ? (
              <Button
                aria-label={t("dataTable.resetFilters")}
                variant="outline"
                size="sm"
                className="border-dashed"
                onClick={onReset}
              >
                <X />
                {t("dataTable.reset")}
              </Button>
            ) : null
          }
        </table.Subscribe>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <DataTableViewOptions table={table} align="end" />
      </div>
    </div>
  );
}
const TEXT_FILTER_DEBOUNCE_MS = 150;

interface DataTableToolbarFilterProps<TData extends RowData> {
  column: Column<typeof dataTableFeatures, TData>;
}

function DataTableToolbarFilter<TData extends RowData>({
  column,
}: DataTableToolbarFilterProps<TData>) {
  const columnMeta = column.columnDef.meta;
  if (!columnMeta?.variant) return null;

  switch (columnMeta.variant) {
    case "text": {
      return (
        <DataTableTextFilter
          label={columnMeta.label ?? column.id}
          placeholder={columnMeta.placeholder ?? columnMeta.label}
          value={filterText(column.getFilterValue())}
          onValueChange={(value) => {
            column.setFilterValue(value);
          }}
          className="h-8 w-full sm:w-56"
        />
      );
    }

    case "number": {
      return (
        <div className="relative w-full sm:w-auto">
          <DataTableTextFilter
            type="number"
            inputMode="numeric"
            label={columnMeta.label ?? column.id}
            placeholder={columnMeta.placeholder ?? columnMeta.label}
            value={filterText(column.getFilterValue())}
            onValueChange={(value) => {
              column.setFilterValue(value);
            }}
            className={cn("h-8 w-full sm:w-36", columnMeta.unit && "pr-8")}
          />
          {columnMeta.unit && (
            <span className="absolute inset-y-0 right-0 flex items-center rounded-r-md bg-accent px-2 text-sm text-muted-foreground">
              {columnMeta.unit}
            </span>
          )}
        </div>
      );
    }

    case "range": {
      return (
        <DataTableSliderFilter
          column={column}
          title={columnMeta.label ?? column.id}
        />
      );
    }

    case "date":
    case "dateRange": {
      return (
        <DataTableDateFilter
          column={column}
          title={columnMeta.label ?? column.id}
          multiple={columnMeta.variant === "dateRange"}
        />
      );
    }

    case "select":
    case "multiSelect": {
      return (
        <DataTableFacetedFilter
          column={column}
          title={columnMeta.label ?? column.id}
          options={columnMeta.options ?? []}
          multiple={columnMeta.variant === "multiSelect"}
        />
      );
    }

    case "boolean":
    default: {
      return null;
    }
  }
}

interface DataTableTextFilterProps extends Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}

// Keeps keystrokes local and filters the rows once typing pauses.
function DataTableTextFilter({
  label,
  value,
  onValueChange,
  ...props
}: DataTableTextFilterProps) {
  const [draft, setDraft] = React.useState(value);
  const [prevValue, setPrevValue] = React.useState(value);
  const debouncedChange = useDebouncedCallback(
    onValueChange,
    TEXT_FILTER_DEBOUNCE_MS,
  );

  // Follow outside changes, such as Reset.
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  return (
    <Input
      aria-label={label}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        debouncedChange(event.target.value);
      }}
      {...props}
    />
  );
}

function filterText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

"use client";

import i18n from "@/lib/i18n.ts";
import type { Column, RowData } from "@tanstack/react-table";
import * as React from "react";

import { Input } from "@/components/ui/input";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";
import type { ExtendedColumnFilter } from "@/types/data-table";

interface DataTableRangeFilterProps<
  TData extends RowData,
> extends React.ComponentProps<"div"> {
  filter: ExtendedColumnFilter<TData>;
  column: Column<typeof dataTableFeatures, TData>;
  inputId: string;
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>,
  ) => void;
}

export function DataTableRangeFilter<TData extends RowData>({
  filter,
  column,
  inputId,
  onFilterUpdate,
  className,
  ...props
}: DataTableRangeFilterProps<TData>) {
  const meta = column.columnDef.meta;

  const [min, max] = React.useMemo(() => {
    const range = column.columnDef.meta?.range;
    if (range) return range;

    const values = column.getFacetedMinMaxValues();
    if (!values) return [0, 100];

    return [values[0], values[1]];
  }, [column]);

  const formatValue = React.useCallback(
    (value: string | number | undefined) => {
      if (value === undefined || value === "") return "";
      const numValue = Number(value);
      return Number.isNaN(numValue)
        ? ""
        : numValue.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          });
    },
    [],
  );

  const value = React.useMemo(() => {
    if (Array.isArray(filter.value)) return filter.value.map(formatValue);
    return [formatValue(filter.value), ""];
  }, [filter.value, formatValue]);

  const onRangeValueChange = React.useCallback(
    (input: string, isMin?: boolean) => {
      const numValue = Number(input);
      const currentValues = Array.isArray(filter.value)
        ? filter.value
        : ["", ""];
      const otherValue = isMin
        ? (currentValues[1] ?? "")
        : (currentValues[0] ?? "");

      if (
        input === "" ||
        (!Number.isNaN(numValue) &&
          (isMin
            ? numValue >= min && numValue <= (Number(otherValue) || max)
            : numValue <= max && numValue >= (Number(otherValue) || min)))
      ) {
        onFilterUpdate(filter.filterId, {
          value: isMin ? [input, otherValue] : [otherValue, input],
        });
      }
    },
    [filter.filterId, filter.value, min, max, onFilterUpdate],
  );

  return (
    <div
      data-slot="range"
      className={cn("flex w-full items-center gap-2", className)}
      {...props}
    >
      <Input
        id={`${inputId}-min`}
        type="number"
        aria-label={i18n.t("common:dataTable.minValue", {
          label: meta?.label,
        })}
        aria-valuemin={min}
        aria-valuemax={max}
        data-slot="range-min"
        inputMode="numeric"
        placeholder={min.toString()}
        min={min}
        max={max}
        className="h-8 w-full rounded-sm"
        defaultValue={value[0]}
        onChange={(event) => {
          onRangeValueChange(event.target.value, true);
        }}
      />
      <span className="sr-only shrink-0 text-muted-foreground">to</span>
      <Input
        id={`${inputId}-max`}
        type="number"
        aria-label={i18n.t("common:dataTable.maxValue", {
          label: meta?.label,
        })}
        aria-valuemin={min}
        aria-valuemax={max}
        data-slot="range-max"
        inputMode="numeric"
        placeholder={max.toString()}
        min={min}
        max={max}
        className="h-8 w-full rounded-sm"
        defaultValue={value[1]}
        onChange={(event) => {
          onRangeValueChange(event.target.value);
        }}
      />
    </div>
  );
}

"use client";

import { formatNumber } from "@/lib/format.ts";
import { useTranslation } from "react-i18next";
import type { Column, RowData } from "@tanstack/react-table";
import { PlusCircle, XCircle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";

interface Range {
  min: number;
  max: number;
}

type RangeValue = [number, number];

function getIsValidRange(value: unknown): value is RangeValue {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function parseValuesAsNumbers(value: unknown): RangeValue | undefined {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (v) =>
        (typeof v === "string" || typeof v === "number") && !Number.isNaN(v),
    )
  ) {
    return [Number(value[0]), Number(value[1])];
  }

  return undefined;
}

interface DataTableSliderFilterProps<TData extends RowData> {
  column: Column<typeof dataTableFeatures, TData>;
  title?: string;
}

export function DataTableSliderFilter<TData extends RowData>({
  column,
  title,
}: DataTableSliderFilterProps<TData>) {
  const { t } = useTranslation("common");
  const id = React.useId();

  const columnFilterValue = parseValuesAsNumbers(column.getFilterValue());

  const defaultRange = column.columnDef.meta?.range;
  const unit = column.columnDef.meta?.unit;

  const { min, max, step } = React.useMemo<Range & { step: number }>(() => {
    let minValue = 0;
    let maxValue = 100;

    if (defaultRange && getIsValidRange(defaultRange)) {
      [minValue, maxValue] = defaultRange;
    } else {
      const values = column.getFacetedMinMaxValues();
      if (values) {
        const [facetMinValue, facetMaxValue] = values;
        if (
          typeof facetMinValue === "number" &&
          typeof facetMaxValue === "number"
        ) {
          minValue = facetMinValue;
          maxValue = facetMaxValue;
        }
      }
    }

    const rangeSize = maxValue - minValue;
    const stepSize =
      rangeSize <= 20
        ? 1
        : rangeSize <= 100
          ? Math.ceil(rangeSize / 20)
          : Math.ceil(rangeSize / 50);

    return { min: minValue, max: maxValue, step: stepSize };
  }, [column, defaultRange]);

  const range = React.useMemo(
    (): RangeValue => columnFilterValue ?? [min, max],
    [columnFilterValue, min, max],
  );

  const formatValue = React.useCallback(
    (value: number) => formatNumber(value, { maximumFractionDigits: 0 }),
    [],
  );

  const onFromInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = Number(event.target.value);
      if (!Number.isNaN(numValue) && numValue >= min && numValue <= range[1]) {
        column.setFilterValue([numValue, range[1]]);
      }
    },
    [column, min, range],
  );

  const onToInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = Number(event.target.value);
      if (!Number.isNaN(numValue) && numValue <= max && numValue >= range[0]) {
        column.setFilterValue([range[0], numValue]);
      }
    },
    [column, max, range],
  );

  const onSliderValueChange = React.useCallback(
    (value: number | readonly number[]) => {
      if (Array.isArray(value) && value.length === 2) {
        column.setFilterValue([value[0], value[1]] satisfies RangeValue);
      }
    },
    [column],
  );

  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const onReset = React.useCallback(() => {
    column.setFilterValue(undefined);
    triggerRef.current?.focus();
  }, [column]);

  return (
    <Popover>
      <ButtonGroup aria-label={title}>
        {columnFilterValue ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("dataTable.clearFilter", { title })}
            className="border-dashed"
            onClick={onReset}
          >
            <XCircle />
          </Button>
        ) : null}
        <PopoverTrigger
          render={
            <Button
              ref={triggerRef}
              variant="outline"
              size="sm"
              className="border-dashed font-normal"
            />
          }
        >
          {columnFilterValue ? null : <PlusCircle />}
          <span>{title}</span>
          {columnFilterValue ? (
            <>
              <Separator
                orientation="vertical"
                className="mx-0.5 data-[orientation=vertical]:h-4"
              />
              {formatValue(columnFilterValue[0])} -{" "}
              {formatValue(columnFilterValue[1])}
              {unit ? ` ${unit}` : ""}
            </>
          ) : null}
        </PopoverTrigger>
      </ButtonGroup>
      <PopoverContent
        aria-label={title}
        align="start"
        className="flex w-auto flex-col gap-4"
      >
        <FieldGroup className="gap-3">
          <p className="leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {title}
          </p>
          <div className="flex items-center gap-4">
            <Field className="gap-2">
              <FieldLabel htmlFor={`${id}-from`} className="text-xs">
                {t("dataTable.from")}
              </FieldLabel>
              <div className="relative">
                <Input
                  id={`${id}-from`}
                  type="number"
                  aria-valuemin={min}
                  aria-valuemax={max}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={min.toString()}
                  min={min}
                  max={max}
                  value={range[0].toString()}
                  onChange={onFromInputChange}
                  className={cn("h-8 w-24", unit && "pr-8")}
                />
                {unit && (
                  <span className="absolute inset-y-0 right-0 flex items-center rounded-r-md bg-accent px-2 text-sm text-muted-foreground">
                    {unit}
                  </span>
                )}
              </div>
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor={`${id}-to`} className="text-xs">
                {t("dataTable.to")}
              </FieldLabel>
              <div className="relative">
                <Input
                  id={`${id}-to`}
                  type="number"
                  aria-valuemin={min}
                  aria-valuemax={max}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={max.toString()}
                  min={min}
                  max={max}
                  value={range[1].toString()}
                  onChange={onToInputChange}
                  className={cn("h-8 w-24", unit && "pr-8")}
                />
                {unit && (
                  <span className="absolute inset-y-0 right-0 flex items-center rounded-r-md bg-accent px-2 text-sm text-muted-foreground">
                    {unit}
                  </span>
                )}
              </div>
            </Field>
          </div>
          <Field className="gap-2">
            <FieldLabel htmlFor={`${id}-slider`} className="sr-only">
              {t("dataTable.sliderLabel", { title })}
            </FieldLabel>
            <Slider
              id={`${id}-slider`}
              min={min}
              max={max}
              step={step}
              value={range}
              onValueChange={onSliderValueChange}
            />
          </Field>
        </FieldGroup>
        <Button
          aria-label={t("dataTable.clearFilter", { title })}
          variant="outline"
          size="sm"
          onClick={onReset}
        >
          {t("dataTable.clear")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

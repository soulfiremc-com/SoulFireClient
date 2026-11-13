import assert from "node:assert/strict";
import { test } from "node:test";
import { constructTable, tableFeatures } from "@tanstack/table-core";
import { storeReactivityBindings } from "@tanstack/table-core/store-reactivity-bindings";
import { calendarDateRangeFilter } from "./calendar-date-range-filter";
import { dataTableFeatures } from "./data-table-features";
import { getTableColumnFilters } from "./data-table-state";

const features = tableFeatures({
  ...dataTableFeatures,
  coreReactivityFeature: storeReactivityBindings(),
});
const columns = [
  {
    id: "timestamp",
    accessorKey: "timestamp",
    meta: { variant: "dateRange" as const },
    filterFn: calendarDateRangeFilter,
  },
];

function filteredIds(dates: Date[], range: (number | undefined)[] | string) {
  const table = constructTable({
    features,
    columns,
    data: dates.map((timestamp) => ({
      id: timestamp.getTime(),
      timestamp,
    })),
    initialState: {
      columnFilters:
        typeof range === "string"
          ? getTableColumnFilters({ timestamp: range }, columns)
          : [{ id: "timestamp", value: range }],
    },
  });
  return table.getFilteredRowModel().rows.map((row) => row.original.id);
}

test("calendar ranges include both full boundary days", () => {
  const before = new Date(2026, 9, 23, 23, 59, 59, 999);
  const start = new Date(2026, 9, 24);
  const end = new Date(2026, 9, 25);
  const morning = new Date(2026, 9, 25, 8);
  const last = new Date(2026, 9, 25, 23, 59, 59, 999);
  const after = new Date(2026, 9, 26);
  const dates = [before, start, morning, last, after];
  const expected = [start, morning, last].map((date) => date.getTime());
  assert.deepEqual(
    filteredIds(dates, [start.getTime(), end.getTime()]),
    expected,
  );
  assert.deepEqual(
    filteredIds(dates, `${start.getTime()},${end.getTime()}`),
    expected,
  );
});

test("same-day ranges follow the local calendar across daylight saving changes", () => {
  for (const [month, day] of [
    [2, 29],
    [9, 25],
    [10, 1],
  ] as const) {
    const first = new Date(2026, month, day);
    const last = new Date(2026, month, day, 23, 59, 59, 999);
    const before = new Date(first.getTime() - 1);
    const after = new Date(2026, month, day + 1);
    assert.deepEqual(
      filteredIds(
        [before, first, last, after],
        [first.getTime(), first.getTime()],
      ),
      [first.getTime(), last.getTime()],
    );
  }
});

test("partial and reversed ranges keep calendar-day semantics", () => {
  const first = new Date(2026, 9, 24, 12);
  const last = new Date(2026, 9, 25, 12);
  const next = new Date(2026, 9, 26);
  const dates = [first, last, next];
  assert.deepEqual(filteredIds(dates, `,${last.getTime()}`), [
    first.getTime(),
    last.getTime(),
  ]);
  assert.deepEqual(filteredIds(dates, [last.getTime(), undefined]), [
    last.getTime(),
    next.getTime(),
  ]);
  assert.deepEqual(filteredIds(dates, [last.getTime(), first.getTime()]), [
    first.getTime(),
    last.getTime(),
  ]);
});

test("invalid row dates do not match open-ended calendar ranges", () => {
  const valid = new Date(2026, 9, 25, 12);
  assert.deepEqual(filteredIds([new Date(NaN), valid], `,${valid.getTime()}`), [
    valid.getTime(),
  ]);
});

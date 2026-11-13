import assert from "node:assert/strict";
import { test } from "node:test";
import { constructTable, tableFeatures } from "@tanstack/table-core";
import { storeReactivityBindings } from "@tanstack/table-core/store-reactivity-bindings";
import { dataTableFeatures } from "./data-table-features.ts";
import {
  getTableColumnFilters,
  getTablePagination,
  getValidPageIndex,
} from "./data-table-state.ts";

const features = tableFeatures({
  ...dataTableFeatures,
  coreReactivityFeature: storeReactivityBindings(),
});
const data = [
  {
    id: "one",
    text: "table-qa-01 127.0.0.1:26001 Grüße",
    value: -2,
  },
  { id: "two", text: "table-qa-02", value: 4 },
];

function filteredIds(text: string) {
  const columns = [
    { id: "text", accessorKey: "text", meta: { variant: "text" as const } },
  ];
  const table = constructTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    initialState: { columnFilters: getTableColumnFilters({ text }, columns) },
  });
  return table.getFilteredRowModel().rows.map((row) => row.id);
}

test("restored text filters retain punctuation, whitespace, and Unicode matches", () => {
  for (const value of ["table-qa-01", "127.0.0.1:26001", "01 127", "Grüße"]) {
    assert.deepEqual(filteredIds(value), ["one"]);
  }
  assert.deepEqual(filteredIds("missing"), []);
});

test("faceted selections are preserved without splitting their values", () => {
  const selected = ["SOCKS5", "value,with-comma"];
  const filters = getTableColumnFilters({ type: selected, unused: null }, [
    { id: "type", meta: { variant: "multiSelect" } },
  ]);
  assert.equal(filters.length, 1);
  assert.equal(filters[0]?.value, selected);
});

test("signed and open-ended ranges retain their numeric filter semantics", () => {
  const columns = [
    {
      id: "value",
      accessorKey: "value",
      meta: { variant: "range" as const },
      filterFn: "inNumberRange" as const,
    },
  ];
  const restored = getTableColumnFilters({ value: "-3,-1" }, columns);
  const table = constructTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    initialState: { columnFilters: restored },
  });
  assert.deepEqual(
    table.getFilteredRowModel().rows.map((row) => row.id),
    ["one"],
  );
  table.setColumnFilters(getTableColumnFilters({ value: ",4" }, columns));
  assert.deepEqual(
    table.getFilteredRowModel().rows.map((row) => row.id),
    ["one", "two"],
  );
});

test("date ranges restore timestamp bounds for numeric filtering", () => {
  const columns = [
    {
      id: "value",
      accessorKey: "value",
      meta: { variant: "dateRange" as const },
      filterFn: "inNumberRange" as const,
    },
  ];
  const table = constructTable({
    features,
    columns,
    data: [
      { id: "before", value: 1760000000000 },
      { id: "within", value: 1761500000000 },
      { id: "after", value: 1763000000000 },
    ],
    getRowId: (row) => row.id,
    initialState: {
      columnFilters: getTableColumnFilters(
        { value: "1761000000000,1762000000000" },
        columns,
      ),
    },
  });
  assert.deepEqual(
    table.getFilteredRowModel().rows.map((row) => row.id),
    ["within"],
  );
});

test("invalid URL pagination falls back to usable, finite pagination", () => {
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.deepEqual(getTablePagination(value, value, 20), {
      pageIndex: 0,
      pageSize: 20,
    });
  }
  assert.deepEqual(getTablePagination(2, 25), { pageIndex: 1, pageSize: 25 });
  assert.deepEqual(getTablePagination(0, 0, 0), { pageIndex: 0, pageSize: 10 });
});

test("unavailable pages reset without changing valid saved pages", () => {
  assert.equal(getValidPageIndex(998, 2), 0);
  assert.equal(getValidPageIndex(2, 2), 0);
  assert.equal(getValidPageIndex(0, 0), 0);
  assert.equal(getValidPageIndex(1, 2), 1);
  assert.equal(getValidPageIndex(998, -1), 998);
});

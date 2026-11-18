import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table";
import type { TableColumnMeta, TableQueryMeta } from "@/types/data-table";

export const dataTableFeatures = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc needs the type carrier because TableColumnMeta comes from a module augmentation
  columnMeta: {} as TableColumnMeta,
  facetedMinMaxValues: createFacetedMinMaxValues(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  // oxlint-disable-next-line typescript/no-deprecated -- columns resolve built-in filter functions by name, which needs the full registry
  filterFns,
  // oxlint-disable-next-line typescript/no-deprecated -- columns resolve built-in sort functions by name, which needs the full registry
  sortFns,
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc needs the type carrier because TableQueryMeta comes from a module augmentation
  tableMeta: {} as TableQueryMeta,
});

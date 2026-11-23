import {
  type ColumnFiltersState,
  type PaginationState,
  type ReactTable,
  type RowData,
  type SortingState,
  type TableOptions,
  type TableState,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  type SingleParser,
  throttle,
  type UseQueryStateOptions,
  useQueryState,
  useQueryStates,
} from "nuqs";
import * as React from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { dataTableFeatures } from "@/lib/data-table-features";
import {
  getTableColumnFilters,
  getTablePagination,
  getValidPageIndex,
} from "@/lib/data-table-state";
import { getSortingStateParser } from "@/lib/parsers";
import type { ExtendedColumnSort, QueryKeys } from "@/types/data-table";

const PAGE_KEY = "page";
const PER_PAGE_KEY = "perPage";
const SORT_KEY = "sort";
const ARRAY_SEPARATOR = ",";
const DEBOUNCE_MS = 300;
const THROTTLE_MS = 50;

interface UseDataTableProps<TData extends RowData>
  extends
    Omit<
      TableOptions<typeof dataTableFeatures, TData>,
      | "features"
      | "state"
      | "pageCount"
      | "manualFiltering"
      | "manualPagination"
      | "manualSorting"
    >,
    Pick<TableOptions<typeof dataTableFeatures, TData>, "pageCount"> {
  initialState?: Omit<
    Partial<TableState<typeof dataTableFeatures>>,
    "sorting"
  > & {
    sorting?: ExtendedColumnSort<TData>[];
  };
  queryKeys?: Partial<QueryKeys>;
  history?: "push" | "replace";
  debounceMs?: number;
  throttleMs?: number;
  clearOnDefault?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  startTransition?: React.TransitionStartFunction;
}

export function useDataTable<TData extends RowData>(
  props: UseDataTableProps<TData>,
) {
  const {
    columns,
    pageCount,
    initialState,
    queryKeys,
    history = "replace",
    debounceMs = DEBOUNCE_MS,
    throttleMs = THROTTLE_MS,
    clearOnDefault = false,
    scroll = false,
    shallow = true,
    startTransition,
    ...tableProps
  } = props;
  const pageKey = queryKeys?.page ?? PAGE_KEY;
  const perPageKey = queryKeys?.perPage ?? PER_PAGE_KEY;
  const sortKey = queryKeys?.sort ?? SORT_KEY;

  const queryStateOptions = React.useMemo<
    Omit<UseQueryStateOptions<string>, "parse">
  >(
    () => ({
      history,
      scroll,
      shallow,
      limitUrlUpdates: throttle(throttleMs),
      debounceMs,
      clearOnDefault,
      ...(startTransition && { startTransition }),
    }),
    [
      history,
      scroll,
      shallow,
      throttleMs,
      debounceMs,
      clearOnDefault,
      startTransition,
    ],
  );

  const [page, setPage] = useQueryState(
    pageKey,
    parseAsInteger.withOptions(queryStateOptions).withDefault(1),
  );
  const [perPage, setPerPage] = useQueryState(
    perPageKey,
    parseAsInteger
      .withOptions(queryStateOptions)
      .withDefault(initialState?.pagination?.pageSize ?? 10),
  );

  const pagination = React.useMemo(
    () => getTablePagination(page, perPage, initialState?.pagination?.pageSize),
    [page, perPage, initialState?.pagination?.pageSize],
  );

  const onPaginationChange = React.useCallback(
    (updaterOrValue: Updater<PaginationState>) => {
      if (typeof updaterOrValue === "function") {
        const newPagination = updaterOrValue(pagination);
        void setPage(newPagination.pageIndex + 1);
        void setPerPage(newPagination.pageSize);
      } else {
        void setPage(updaterOrValue.pageIndex + 1);
        void setPerPage(updaterOrValue.pageSize);
      }
    },
    [pagination, setPage, setPerPage],
  );

  const columnIds = React.useMemo(
    () =>
      new Set(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Table types state and features without the extended filter and sort fields this table adds
        columns.map((column) => column.id).filter(Boolean) as string[],
      ),
    [columns],
  );

  const [sorting, setSorting] = useQueryState(
    sortKey,
    getSortingStateParser<TData>(columnIds)
      .withOptions(queryStateOptions)
      .withDefault(initialState?.sorting ?? []),
  );

  const onSortingChange = React.useCallback(
    (updaterOrValue: Updater<SortingState>) => {
      if (typeof updaterOrValue === "function") {
        const newSorting = updaterOrValue(sorting);
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Table types state and features without the extended filter and sort fields this table adds
        void setSorting(newSorting as ExtendedColumnSort<TData>[]);
      } else {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Table types state and features without the extended filter and sort fields this table adds
        void setSorting(updaterOrValue as ExtendedColumnSort<TData>[]);
      }
    },
    [sorting, setSorting],
  );

  const filterableColumns = React.useMemo(
    () => columns.filter((column) => column.enableColumnFilter),
    [columns],
  );

  const filterParsers = React.useMemo(
    () =>
      filterableColumns.reduce<
        Record<string, SingleParser<string> | SingleParser<string[]>>
      >((acc, column) => {
        if (column.meta?.options) {
          acc[column.id ?? ""] = parseAsArrayOf(
            parseAsString,
            ARRAY_SEPARATOR,
          ).withOptions(queryStateOptions);
        } else {
          acc[column.id ?? ""] = parseAsString.withOptions(queryStateOptions);
        }
        return acc;
      }, {}),
    [filterableColumns, queryStateOptions],
  );

  const [filterValues, setFilterValues] = useQueryStates(filterParsers);

  const debouncedSetFilterValues = useDebouncedCallback(
    (values: typeof filterValues) => {
      void setPage(1);
      void setFilterValues(values);
    },
    debounceMs,
  );

  // The URL only seeds the filters. Afterwards the table owns them, so typing
  // re-renders the table parts that read filters instead of the whole page.
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [initialColumnFilters] = React.useState<ColumnFiltersState>(() =>
    getTableColumnFilters(filterValues, filterableColumns),
  );

  const table = useTable(
    {
      ...tableProps,
      features: dataTableFeatures,
      columns,
      initialState: {
        ...initialState,
        columnFilters: initialColumnFilters,
      },
      ...(pageCount !== undefined && { pageCount }),
      // Pagination and sorting live in the URL. Selection, visibility, and
      // filters stay in table atoms that `table.Subscribe` consumers read.
      state: {
        pagination,
        sorting,
      },
      defaultColumn: {
        ...tableProps.defaultColumn,
        enableColumnFilter: false,
      },
      // Modified to prevent selecting some rows
      enableRowSelection: tableProps.enableRowSelection ?? true,
      onPaginationChange,
      onSortingChange,
    },
    // Do not re-render the host component for table state changes.
    () => null,
  );

  React.useEffect(() => {
    let previous = table.atoms.columnFilters.get();
    const subscription = table.atoms.columnFilters.subscribe((next) => {
      if (next === previous) return;

      const filterUpdates: Record<string, string | string[] | null> = {};
      for (const filter of next) {
        if (filterableColumns.some((column) => column.id === filter.id)) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Table types state and features without the extended filter and sort fields this table adds
          filterUpdates[filter.id] = filter.value as string | string[];
        }
      }
      for (const prevFilter of previous) {
        if (!next.some((filter) => filter.id === prevFilter.id)) {
          filterUpdates[prevFilter.id] = null;
        }
      }

      previous = next;
      // Leave a later page right away so the filtered rows stay visible.
      if (table.atoms.pagination.get().pageIndex !== 0) void setPage(1);
      debouncedSetFilterValues(filterUpdates);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [table, debouncedSetFilterValues, filterableColumns, setPage]);

  const validPageIndex = getValidPageIndex(
    pagination.pageIndex,
    table.getPageCount(),
  );
  React.useEffect(() => {
    if (page !== validPageIndex + 1) void setPage(validPageIndex + 1);
    if (perPage !== pagination.pageSize) void setPerPage(pagination.pageSize);
  }, [page, perPage, validPageIndex, pagination.pageSize, setPage, setPerPage]);

  return React.useMemo(
    () => ({
      // `table.state` stays empty because the host does not subscribe.
      // Read state with `table.Subscribe` or the table getters instead.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Table types state and features without the extended filter and sort fields this table adds
      table: table as unknown as ReactTable<typeof dataTableFeatures, TData>,
    }),
    [table],
  );
}

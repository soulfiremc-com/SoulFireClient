import { Schema, Result } from "effect";
import {
  createParser,
  createStandardSchemaV1,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { dataTableConfig } from "@/config/data-table";

import type {
  ExtendedColumnFilter,
  ExtendedColumnSort,
} from "@/types/data-table";

const sortingItemSchema = Schema.Struct({
  id: Schema.String,
  desc: Schema.Boolean,
});

export const getSortingStateParser = <TData>(
  columnIds?: string[] | Set<string>,
) => {
  const validKeys = columnIds
    ? columnIds instanceof Set
      ? columnIds
      : new Set(columnIds)
    : null;

  return createParser({
    parse: (value) => {
      try {
        const parsed = JSON.parse(value);
        const result = Schema.decodeUnknownResult(
          Schema.mutable(Schema.Array(sortingItemSchema)),
          { errors: "all" },
        )(parsed);

        if (!Result.isSuccess(result)) return null;

        if (
          validKeys &&
          result.success.some((item) => !validKeys.has(item.id))
        ) {
          return null;
        }

        return result.success as ExtendedColumnSort<TData>[];
      } catch {
        return null;
      }
    },
    serialize: (value) => JSON.stringify(value),
    eq: (a, b) =>
      a.length === b.length &&
      a.every(
        (item, index) =>
          item.id === b[index]?.id && item.desc === b[index]?.desc,
      ),
  });
};

const filterItemSchema = Schema.Struct({
  id: Schema.String,
  value: Schema.Union([
    Schema.String,
    Schema.mutable(Schema.Array(Schema.String)),
  ]),
  variant: Schema.Literals(dataTableConfig.filterVariants),
  operator: Schema.Literals(dataTableConfig.operators),
  filterId: Schema.String,
});

export type FilterItemSchema = (typeof filterItemSchema)["Type"];

export const getFiltersStateParser = <TData>(
  columnIds?: string[] | Set<string>,
) => {
  const validKeys = columnIds
    ? columnIds instanceof Set
      ? columnIds
      : new Set(columnIds)
    : null;

  return createParser({
    parse: (value) => {
      try {
        const parsed = JSON.parse(value);
        const result = Schema.decodeUnknownResult(
          Schema.mutable(Schema.Array(filterItemSchema)),
          { errors: "all" },
        )(parsed);

        if (!Result.isSuccess(result)) return null;

        if (
          validKeys &&
          result.success.some((item) => !validKeys.has(item.id))
        ) {
          return null;
        }

        return result.success as ExtendedColumnFilter<TData>[];
      } catch {
        return null;
      }
    },
    serialize: (value) => JSON.stringify(value),
    eq: (a, b) =>
      a.length === b.length &&
      a.every(
        (filter, index) =>
          filter.id === b[index]?.id &&
          filter.value === b[index]?.value &&
          filter.variant === b[index]?.variant &&
          filter.operator === b[index]?.operator,
      ),
  });
};

/**
 * Search params definition for data table routes.
 * Used with TanStack Router's validateSearch for type-safe URL state.
 */
export const dataTableSearchParams = {
  page: parseAsInteger,
  perPage: parseAsInteger,
  sort: parseAsString,
  filters: parseAsString,
  joinOperator: parseAsStringLiteral(dataTableConfig.joinOperators),
};

/**
 * Standard Schema validator for data table search params.
 * Use this with TanStack Router's validateSearch option.
 *
 * @example
 * export const Route = createFileRoute('/my-route')({
 *   validateSearch: dataTableValidateSearch,
 *   component: MyComponent,
 * })
 */
export const dataTableValidateSearch = createStandardSchemaV1(
  dataTableSearchParams,
  {
    partialOutput: true,
  },
);

/** One part of an exact setting link. Matches parseSettingFocusSearch limits. */
const settingFocusPart = createParser({
  parse: (value) => (value.length > 0 && value.length <= 256 ? value : null),
  serialize: (value: string) => value,
});

/**
 * Table routes that the first-bot guide links to. "guide" offers a way back to
 * the guide, and "providers" also opens the provider dialog. The focus params
 * open one field in the page's settings section without changing table state.
 */
export const guidedTableValidateSearch = createStandardSchemaV1(
  {
    ...dataTableSearchParams,
    guide: parseAsStringLiteral(["setup", "providers"]),
    focusNamespace: settingFocusPart,
    focusKey: settingFocusPart,
  },
  { partialOutput: true },
);

/**
 * Search params definition for simple search input routes.
 */
export const simpleSearchParams = {
  search: parseAsString,
};

/**
 * Standard Schema validator for simple search params.
 */
export const botListValidateSearch = createStandardSchemaV1(
  {
    ...simpleSearchParams,
    status: parseAsStringLiteral([
      "connected",
      "starting",
      "retrying",
      "failed",
      "stopping",
      "stopped",
    ]),
  },
  { partialOutput: true },
);

export const simpleSearchValidateSearch = createStandardSchemaV1(
  simpleSearchParams,
  {
    partialOutput: true,
  },
);

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type inferParserType,
  createLoader,
  createSerializer,
  createStandardSchemaV1,
  parseAsJson,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";
import { z } from "zod";
import { parseUrlSearch, stringifyUrlSearch } from "./router-search";

const parsers = {
  sort: parseAsJson(
    z.array(z.object({ id: z.enum(["name", "id"]), desc: z.boolean() })),
  ),
  filters: parseAsJson(z.array(z.record(z.string(), z.unknown()))),
  page: parseAsInteger,
  perPage: parseAsInteger,
};

const dataTableValidateSearch = createStandardSchemaV1(
  {
    sort: parseAsString,
    filters: parseAsString,
    page: parseAsInteger,
    perPage: parseAsInteger,
  },
  { partialOutput: true },
);
const simpleSearchValidateSearch = createStandardSchemaV1(
  { search: parseAsString },
  { partialOutput: true },
);

test("nuqs table state survives router parsing, validation and link serialization", async () => {
  const expected: inferParserType<typeof parsers> = {
    sort: [
      { id: "name", desc: true },
      { id: "id", desc: false },
    ],
    filters: [
      {
        id: "name",
        value: "日本語 +[a,b]&text",
        variant: "text" as const,
        operator: "iLike" as const,
        filterId: "name-filter",
      },
    ],
    page: 2,
    perPage: 25,
  };
  const url = createSerializer(parsers)(expected);
  const parsed = parseUrlSearch(url);
  assert.equal(typeof parsed.sort, "string");
  assert.equal(typeof parsed.filters, "string");
  const validated = await dataTableValidateSearch["~standard"].validate(parsed);
  assert.ok("value" in validated);
  const linked = stringifyUrlSearch(validated.value);
  assert.deepEqual(createLoader(parsers)(linked), expected);
  const restored = await dataTableValidateSearch["~standard"].validate(
    parseUrlSearch(linked),
  );
  assert.deepEqual(restored, validated);
});

test("JSON-looking search text stays literal through nuqs and router round trips", async () => {
  const text = { search: parseAsString };
  for (const search of [
    "[10,20]",
    '{"value":"日本語"}',
    '"quoted"',
    "true",
    "123",
    "00123",
  ]) {
    const parsed = parseUrlSearch(createSerializer(text)({ search }));
    const validated =
      await simpleSearchValidateSearch["~standard"].validate(parsed);
    assert.ok("value" in validated);
    assert.deepEqual(createLoader(text)(stringifyUrlSearch(validated.value)), {
      search,
    });
  }
});

test("partial pagination and default removals remain independent of table JSON", async () => {
  const url = createSerializer(parsers)({ page: 3, perPage: 50, sort: null });
  const validated = await dataTableValidateSearch["~standard"].validate(
    parseUrlSearch(url),
  );
  assert.ok("value" in validated);
  assert.deepEqual(validated.value, { page: 3, perPage: 50 });
  assert.deepEqual(createLoader(parsers)(stringifyUrlSearch(validated.value)), {
    page: 3,
    perPage: 50,
    sort: null,
    filters: null,
  });
});

test("invalid table payloads are rejected by their per-key parsers", () => {
  const url = stringifyUrlSearch({
    sort: '[{"id":"unknown","desc":true}]',
    filters: "not-json",
  });
  assert.deepEqual(createLoader(parsers)(url), {
    sort: null,
    filters: null,
    page: null,
    perPage: null,
  });
});

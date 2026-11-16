import assert from "node:assert/strict";
import { test } from "node:test";
import { searchComboOptions } from "./combo-option-search";

const option = (id: string, displayName: string, keywords: string[] = []) => ({
  id,
  displayName,
  keywords,
});

const versions = [
  option("26.3", "26.3"),
  option("1.21.11", "1.21.11"),
  option("1.21.4", "1.21.4"),
  option("1.20.4", "1.20.3-1.20.4"),
  option("bedrock-1.26.51", "Bedrock 1.26.51", ["pocket"]),
];

const ids = (result: { options: { id: string }[] }) =>
  result.options.map((entry) => entry.id);

test("empty query returns the first options and the full count", () => {
  const result = searchComboOptions(versions, " ", 2);
  assert.deepEqual(ids(result), ["26.3", "1.21.11"]);
  assert.equal(result.total, 5);
});

test("empty query keeps the selected option visible", () => {
  assert.deepEqual(
    ids(searchComboOptions(versions, "", 2, "bedrock-1.26.51")),
    ["bedrock-1.26.51", "26.3"],
  );
  assert.deepEqual(ids(searchComboOptions(versions, "", 2, "1.21.11")), [
    "26.3",
    "1.21.11",
  ]);
});

test("exact and prefix matches rank first and keep server order", () => {
  assert.deepEqual(ids(searchComboOptions(versions, "1.21", 10)), [
    "1.21.11",
    "1.21.4",
  ]);
  assert.deepEqual(ids(searchComboOptions(versions, "1.20.4", 10)), ["1.20.4"]);
  assert.deepEqual(ids(searchComboOptions(versions, "26", 10)), [
    "26.3",
    "bedrock-1.26.51",
  ]);
});

test("keywords match when the name does not", () => {
  assert.deepEqual(ids(searchComboOptions(versions, "POCKET", 10)), [
    "bedrock-1.26.51",
  ]);
});

test("limit caps results but total counts every match", () => {
  const result = searchComboOptions(versions, "1", 1);
  assert.equal(result.options.length, 1);
  assert.equal(result.total, 4);
});

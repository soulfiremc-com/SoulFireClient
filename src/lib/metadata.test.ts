import assert from "node:assert/strict";
import { test } from "node:test";
import { updateMetadataEntry } from "./metadata.ts";

test("failed metadata renames retain the original value", async () => {
  const stored = new Map([["old/value", 42]]);
  await assert.rejects(
    updateMetadataEntry(
      {
        oldNamespace: "old",
        oldKey: "value",
        namespace: "new",
        key: "value",
        value: 43,
      },
      {
        setEntry: async () => {
          throw new Error("Write failed");
        },
        deleteEntry: async ({ namespace, key }) => {
          stored.delete(`${namespace}/${key}`);
        },
      },
    ),
  );
  assert.deepEqual([...stored], [["old/value", 42]]);
});

test("metadata renames write the replacement before removing the original", async () => {
  const stored = new Map<string, unknown>([["old/value", 42]]);
  const actions = {
    setEntry: async ({
      namespace,
      key,
      value,
    }: {
      namespace: string;
      key: string;
      value: unknown;
    }) => {
      stored.set(`${namespace}/${key}`, value);
    },
    deleteEntry: async ({
      namespace,
      key,
    }: {
      namespace: string;
      key: string;
    }) => {
      assert.equal(stored.get("new/value"), null);
      stored.delete(`${namespace}/${key}`);
    },
  };
  await updateMetadataEntry(
    {
      oldNamespace: "old",
      oldKey: "value",
      namespace: "new",
      key: "value",
      value: null,
    },
    actions,
  );
  assert.deepEqual([...stored], [["new/value", null]]);
  await updateMetadataEntry(
    {
      oldNamespace: "new",
      oldKey: "value",
      namespace: "new",
      key: "value",
      value: 0,
    },
    actions,
  );
  assert.deepEqual([...stored], [["new/value", 0]]);
});

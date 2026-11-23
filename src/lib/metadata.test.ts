import assert from "node:assert/strict";
import { test } from "node:test";
import { create, type JsonValue } from "@bufbuild/protobuf";
import { SettingsNamespaceSchema } from "@/generated/soulfire/common_pb";
import { jsonToValue } from "@/lib/protobuf.ts";
import { metadataEntriesFromProto, updateMetadataEntry } from "./metadata.ts";

function serverMetadata(entries: Record<string, Record<string, JsonValue>>) {
  return Object.entries(entries).map(([namespace, values]) =>
    create(SettingsNamespaceSchema, {
      namespace,
      entries: Object.entries(values).map(([key, value]) => ({
        key,
        value: jsonToValue(value),
      })),
    }),
  );
}

test("metadata reloads keep row ids for entries that still exist", () => {
  const first = metadataEntriesFromProto(
    serverMetadata({ bot: { level: 1, name: "a" } }),
  );
  assert.deepEqual(
    first.map(({ namespace, key, value }) => [namespace, key, value]),
    [
      ["bot", "level", "1"],
      ["bot", "name", '"a"'],
    ],
  );
  assert.notEqual(first[0]?.id, first[1]?.id);

  const reloaded = metadataEntriesFromProto(
    serverMetadata({ bot: { name: "b", extra: true } }),
    first,
  );
  assert.equal(reloaded[0]?.id, first[1]?.id);
  assert.equal(reloaded[0]?.value, '"b"');
  assert.ok(!first.some((entry) => entry.id === reloaded[1]?.id));
});

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

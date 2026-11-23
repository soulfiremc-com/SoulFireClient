import type { JsonValue } from "@bufbuild/protobuf";
import type { SettingsNamespace } from "@/generated/soulfire/common_pb";
import { valueToJson } from "@/lib/protobuf.ts";

export const metadataNamespacePattern = /^[a-z0-9_.-]+$/u;
export const metadataKeyPattern = /^[a-z0-9_./-]+$/u;

export interface MetadataIdentifier {
  namespace: string;
  key: string;
}
export type MetadataValue = MetadataIdentifier & { value: JsonValue };

/** One metadata entry as the editor shows it. The value is JSON text. */
export interface MetadataEntry extends MetadataIdentifier {
  id: string;
  value: string;
}

let nextMetadataEntryId = 0;

export function createMetadataEntryId(): string {
  nextMetadataEntryId += 1;
  return `metadata-entry-${nextMetadataEntryId}`;
}

function identity(entry: MetadataIdentifier) {
  return `${entry.namespace}\u0000${entry.key}`;
}

/**
 * Converts server metadata to editor entries. Entries that already exist in
 * `previous` keep their id, so a reload does not remount the rows.
 */
export function metadataEntriesFromProto(
  metadata: SettingsNamespace[],
  previous: readonly MetadataEntry[] = [],
): MetadataEntry[] {
  const previousIds = new Map(
    previous.map((entry) => [identity(entry), entry.id]),
  );
  return metadata.flatMap((namespace) =>
    namespace.entries.map((entry) => {
      const id = identity({ namespace: namespace.namespace, key: entry.key });
      return {
        id: previousIds.get(id) ?? createMetadataEntryId(),
        namespace: namespace.namespace,
        key: entry.key,
        value: JSON.stringify(valueToJson(entry.value)),
      };
    }),
  );
}

export async function updateMetadataEntry(
  entry: MetadataValue & { oldNamespace: string; oldKey: string },
  actions: {
    setEntry: (entry: MetadataValue) => Promise<unknown>;
    deleteEntry: (entry: MetadataIdentifier) => Promise<unknown>;
  },
) {
  await actions.setEntry({
    namespace: entry.namespace,
    key: entry.key,
    value: entry.value,
  });
  if (entry.oldNamespace !== entry.namespace || entry.oldKey !== entry.key) {
    await actions.deleteEntry({
      namespace: entry.oldNamespace,
      key: entry.oldKey,
    });
  }
}

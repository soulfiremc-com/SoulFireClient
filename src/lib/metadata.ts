import type { JsonValue } from "@bufbuild/protobuf";

export const metadataNamespacePattern = /^[a-z0-9_.-]+$/;
export const metadataKeyPattern = /^[a-z0-9_./-]+$/;

type MetadataIdentifier = { namespace: string; key: string };
type MetadataValue = MetadataIdentifier & { value: JsonValue };

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

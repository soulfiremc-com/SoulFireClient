import { equals } from "@bufbuild/protobuf";
import {
  ScriptEdgeSchema,
  ScriptNodeSchema,
  ScriptQuotasSchema,
} from "@/generated/soulfire/script_pb";
import { edgesToProto, nodesToProto } from "@/lib/script-service";
import type { ScriptDocumentData } from "@/stores/script-editor-types";

// Compare persisted content without React Flow selection or measured layout.
export function sameScriptDocument(
  first: ScriptDocumentData,
  second: ScriptDocumentData,
): boolean {
  if (
    first.name !== second.name ||
    first.description !== second.description ||
    first.paused !== second.paused ||
    first.nodes.length !== second.nodes.length ||
    first.edges.length !== second.edges.length
  )
    return false;
  if (
    first.quotas !== second.quotas &&
    (!first.quotas ||
      !second.quotas ||
      !equals(ScriptQuotasSchema, first.quotas, second.quotas))
  )
    return false;
  // Most edits change a few items. Skip the items both documents share and
  // convert only the rest.
  return (
    first.nodes.every((node, index) => {
      const other = second.nodes[index];
      if (node === other) return true;
      const [a] = nodesToProto([node]);
      const [b] = other ? nodesToProto([other]) : [];
      return (
        a !== undefined && b !== undefined && equals(ScriptNodeSchema, a, b)
      );
    }) &&
    first.edges.every((edge, index) => {
      const other = second.edges[index];
      if (edge === other) return true;
      const [a] = edgesToProto([edge]);
      const [b] = other ? edgesToProto([other]) : [];
      return (
        a !== undefined && b !== undefined && equals(ScriptEdgeSchema, a, b)
      );
    })
  );
}

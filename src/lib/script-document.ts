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
  if (first.nodes === second.nodes && first.edges === second.edges) return true;
  const firstNodes = nodesToProto(first.nodes);
  const secondNodes = nodesToProto(second.nodes);
  const firstEdges = edgesToProto(first.edges);
  const secondEdges = edgesToProto(second.edges);
  return (
    firstNodes.every((node, index) =>
      equals(ScriptNodeSchema, node, secondNodes[index]),
    ) &&
    firstEdges.every((edge, index) =>
      equals(ScriptEdgeSchema, edge, secondEdges[index]),
    )
  );
}

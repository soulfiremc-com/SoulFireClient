import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { ScriptQuotasSchema } from "@/generated/soulfire/script_pb";
import { normalizeScriptNodeDimensions } from "@/lib/script-node-layout";
import type { ScriptDocumentData } from "@/stores/script-editor-types";

type ImportedScript = Pick<ScriptDocumentData, "nodes" | "edges" | "quotas"> &
  Partial<Pick<ScriptDocumentData, "name" | "description" | "paused">>;

export function serializeScriptFile(data: ScriptDocumentData): string {
  return JSON.stringify(
    {
      version: 1,
      ...data,
      quotas: data.quotas ? toJson(ScriptQuotasSchema, data.quotas) : undefined,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function parseScriptFile(content: string): ImportedScript {
  const data = JSON.parse(content);
  if (
    !data ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges) ||
    (data.name !== undefined && typeof data.name !== "string") ||
    (data.description !== undefined && typeof data.description !== "string") ||
    (data.paused !== undefined && typeof data.paused !== "boolean")
  )
    throw new Error("Invalid script file format");

  // Earlier version 1 exports included the protobuf runtime type name.
  if (data.quotas && typeof data.quotas === "object")
    delete data.quotas.$typeName;

  return {
    nodes: data.nodes.map(normalizeScriptNodeDimensions),
    edges: data.edges,
    name: data.name,
    description: data.description,
    paused: data.paused,
    quotas:
      data.quotas == null
        ? undefined
        : fromJson(ScriptQuotasSchema, data.quotas as JsonValue),
  };
}

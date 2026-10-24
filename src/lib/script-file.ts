import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { z } from "zod";
import { ScriptQuotasSchema } from "@/generated/soulfire/script_pb";
import { scriptGraphSchema } from "@/lib/script-graph";
import type { ScriptDocumentData } from "@/stores/script-editor-types";

type ImportedScript = Pick<ScriptDocumentData, "nodes" | "edges" | "quotas"> &
  Partial<Pick<ScriptDocumentData, "name" | "description" | "paused">>;

const scriptFileSchema = scriptGraphSchema.extend({
  name: z.string().optional(),
  description: z.string().optional(),
  paused: z.boolean().optional(),
  quotas: z.record(z.string(), z.unknown()).nullable().optional(),
});

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
  const data = scriptFileSchema.parse(JSON.parse(content));

  // Earlier version 1 exports included the protobuf runtime type name.
  if (data.quotas && typeof data.quotas === "object")
    delete data.quotas.$typeName;

  return {
    nodes: data.nodes,
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

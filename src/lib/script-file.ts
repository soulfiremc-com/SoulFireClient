import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { z } from "zod";
import { ScriptQuotasSchema } from "@/generated/soulfire/script_pb";
import { normalizeScriptNodeDimensions } from "@/lib/script-node-layout";
import type { ScriptDocumentData } from "@/stores/script-editor-types";

type ImportedScript = Pick<ScriptDocumentData, "nodes" | "edges" | "quotas"> &
  Partial<Pick<ScriptDocumentData, "name" | "description" | "paused">>;

const idSchema = z.string().min(1);
const nodeSchema = z.looseObject({
  id: idSchema,
  type: z.string().min(1).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});
const edgeSchema = z.looseObject({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
const scriptFileSchema = z.object({
  nodes: z
    .array(nodeSchema)
    .refine(
      (nodes) => new Set(nodes.map((node) => node.id)).size === nodes.length,
      "Duplicate node IDs",
    ),
  edges: z
    .array(edgeSchema)
    .refine(
      (edges) => new Set(edges.map((edge) => edge.id)).size === edges.length,
      "Duplicate edge IDs",
    ),
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

import { Schema } from "effect";
import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { ScriptQuotasSchema } from "@/generated/soulfire/script_pb";
import { scriptGraphSchema } from "@/lib/script-graph";
import type { ScriptDocumentData } from "@/stores/script-editor-types";

type ImportedScript = Pick<ScriptDocumentData, "nodes" | "edges" | "quotas"> &
  Partial<Pick<ScriptDocumentData, "name" | "description" | "paused">>;

const scriptFileSchema = scriptGraphSchema.pipe(
  Schema.fieldsAssign({
    name: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    paused: Schema.optional(Schema.Boolean),
    quotas: Schema.optional(
      Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
    ),
  }),
);

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
  const data = Schema.decodeUnknownSync(scriptFileSchema, { errors: "all" })(
    JSON.parse(content),
  );

  // Earlier version 1 exports included the protobuf runtime type name.
  const quotas = data.quotas == null ? undefined : { ...data.quotas };
  if (quotas) delete quotas.$typeName;

  return {
    nodes: data.nodes,
    edges: data.edges,
    name: data.name,
    description: data.description,
    paused: data.paused,
    quotas:
      quotas == null
        ? undefined
        : fromJson(ScriptQuotasSchema, quotas as JsonValue),
  };
}

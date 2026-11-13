import { Schema, Result, SchemaGetter } from "effect";
import { normalizeScriptNodeDimensions } from "@/lib/script-node-layout";

const idSchema = Schema.String.check(Schema.isMinLength(1));
const editorDataSchema = Schema.StructWithRest(
  Schema.Struct({
    label: Schema.optional(Schema.NullOr(Schema.String)),
    muted: Schema.optional(Schema.NullOr(Schema.Boolean)),
    collapsed: Schema.optional(Schema.NullOr(Schema.Boolean)),
    isActive: Schema.optional(Schema.NullOr(Schema.Boolean)),
    hiddenSockets: Schema.optional(
      Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),
    ),
    parentGroupId: Schema.optional(Schema.NullOr(idSchema)),
    parentFrameId: Schema.optional(Schema.NullOr(Schema.String)),
    containedNodes: Schema.optional(
      Schema.NullOr(Schema.mutable(Schema.Array(idSchema))),
    ),
    resolvedType: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
const groupPortsSchema = Schema.optional(
  Schema.NullOr(
    Schema.mutable(
      Schema.Array(
        Schema.StructWithRest(
          Schema.Struct({
            id: idSchema,
            type: Schema.String.check(Schema.isMinLength(1)),
            label: Schema.String,
          }),
          [Schema.Record(Schema.String, Schema.Unknown)],
        ),
      ),
    ),
  ),
);
const rawNodeSchema = Schema.StructWithRest(
  Schema.Struct({
    id: idSchema,
    type: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
    position: Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
    data: editorDataSchema,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
).check(
  Schema.makeFilter((node) => {
    const issues: Schema.FilterIssue[] = [];
    // Only layout nodes use these names for editor ports. Ordinary nodes may
    // have unrelated inputs/outputs in their own parameter data.
    for (const key of ["inputs", "outputs"] as const) {
      if (
        node.type !== "layout.group" &&
        node.type !==
          (key === "inputs" ? "layout.group_output" : "layout.group_input")
      )
        continue;
      if (
        !Result.isSuccess(
          Schema.decodeUnknownResult(groupPortsSchema, { errors: "all" })(
            node.data[key],
          ),
        )
      ) {
        issues.push({
          path: ["data", key],
          issue: "Invalid group ports",
        });
      }
    }
    for (const key of ["content", "color"] as const) {
      if (
        node.type !== "layout.note" &&
        !(node.type === "layout.frame" && key === "color")
      )
        continue;
      if (
        !Result.isSuccess(
          Schema.decodeUnknownResult(
            Schema.optional(Schema.NullOr(Schema.String)),
            { errors: "all" },
          )(node.data[key]),
        )
      ) {
        issues.push({
          path: ["data", key],
          issue: "Invalid layout node text",
        });
      }
    }
    return issues;
  }),
);
const nodeSchema = rawNodeSchema.pipe(
  Schema.decodeTo(Schema.toType(rawNodeSchema), {
    decode: SchemaGetter.transform(normalizeScriptNodeDimensions),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);
const edgeSchema = Schema.StructWithRest(
  Schema.Struct({
    id: idSchema,
    source: idSchema,
    target: idSchema,
    sourceHandle: Schema.optional(Schema.NullOr(Schema.String)),
    targetHandle: Schema.optional(Schema.NullOr(Schema.String)),
    data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

// Files and clipboard payloads must pass the same checks before reaching the editor.
export const scriptGraphSchema = Schema.Struct({
  nodes: Schema.mutable(Schema.Array(nodeSchema)).check(
    Schema.makeFilter(
      (nodes) =>
        new Set(nodes.map((node) => node.id)).size === nodes.length ||
        "Duplicate node IDs",
    ),
  ),
  edges: Schema.mutable(Schema.Array(edgeSchema)).check(
    Schema.makeFilter(
      (edges) =>
        new Set(edges.map((edge) => edge.id)).size === edges.length ||
        "Duplicate edge IDs",
    ),
  ),
});

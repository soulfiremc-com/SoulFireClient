import { z } from "zod";
import { normalizeScriptNodeDimensions } from "@/lib/script-node-layout";

const idSchema = z.string().min(1);
const editorDataSchema = z.looseObject({
  label: z.string().nullish(),
  muted: z.boolean().nullish(),
  collapsed: z.boolean().nullish(),
  isActive: z.boolean().nullish(),
  hiddenSockets: z.array(z.string()).nullish(),
  parentGroupId: idSchema.nullish(),
  parentFrameId: z.string().nullish(),
  containedNodes: z.array(idSchema).nullish(),
  resolvedType: z.string().nullish(),
});
const groupPortsSchema = z
  .array(
    z.looseObject({
      id: idSchema,
      type: z.string().min(1),
      label: z.string(),
    }),
  )
  .nullish();
const nodeSchema = z
  .looseObject({
    id: idSchema,
    type: z.string().min(1).optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: editorDataSchema,
  })
  .superRefine((node, ctx) => {
    // Only layout nodes use these names for editor ports. Ordinary nodes may
    // have unrelated inputs/outputs in their own parameter data.
    for (const key of ["inputs", "outputs"] as const) {
      if (
        node.type !== "layout.group" &&
        node.type !==
          (key === "inputs" ? "layout.group_output" : "layout.group_input")
      )
        continue;
      if (!groupPortsSchema.safeParse(node.data[key]).success) {
        ctx.addIssue({
          code: "custom",
          path: ["data", key],
          message: "Invalid group ports",
        });
      }
    }
    for (const key of ["content", "color"] as const) {
      if (
        node.type !== "layout.note" &&
        !(node.type === "layout.frame" && key === "color")
      )
        continue;
      if (!z.string().nullish().safeParse(node.data[key]).success) {
        ctx.addIssue({
          code: "custom",
          path: ["data", key],
          message: "Invalid layout node text",
        });
      }
    }
  })
  .transform(normalizeScriptNodeDimensions);
const edgeSchema = z.looseObject({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

// Files and clipboard payloads must pass the same checks before reaching the editor.
export const scriptGraphSchema = z.object({
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
});

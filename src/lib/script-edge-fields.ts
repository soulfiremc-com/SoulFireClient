import type { Edge } from "@xyflow/react";

/** Copies optional edge fields without writing explicit `undefined` values. */
export function optionalEdgeFields(fields: {
  sourceHandle?: string | null | undefined;
  targetHandle?: string | null | undefined;
  data?: Record<string, unknown> | undefined;
}): Pick<Edge, "sourceHandle" | "targetHandle" | "data"> {
  return {
    ...(fields.sourceHandle !== undefined && {
      sourceHandle: fields.sourceHandle,
    }),
    ...(fields.targetHandle !== undefined && {
      targetHandle: fields.targetHandle,
    }),
    ...(fields.data !== undefined && { data: fields.data }),
  };
}

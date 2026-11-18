import type { Node } from "@xyflow/react";
import { getNodeDefinition } from "./nodes/types";

/** The name a person sees on a node: its rename, or else its type name. */
export function getNodeDisplayLabel(
  nodes: readonly Node[],
  nodeId: string,
): string | undefined {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  const label = node.data["label"];
  if (typeof label === "string" && label.trim()) return label;
  return getNodeDefinition(node.type ?? "")?.label;
}

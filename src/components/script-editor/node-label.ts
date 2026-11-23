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

/**
 * Compares the parts of two node lists that labels depend on. Moving or
 * resizing nodes does not change the result.
 */
export function sameNodeLabels(
  first: readonly Node[],
  second: readonly Node[],
): boolean {
  return (
    first === second ||
    (first.length === second.length &&
      first.every((node, index) => {
        const other = second[index];
        return (
          other !== undefined &&
          node.id === other.id &&
          node.type === other.type &&
          node.data["label"] === other.data["label"]
        );
      }))
  );
}

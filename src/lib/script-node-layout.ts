import type { Node } from "@xyflow/react";

const resizableNodeTypes = new Set(["layout.frame", "layout.note"]);

export const GROUP_INTERFACE_NODE_WIDTH = 180;

export function persistedNodeDimensions(
  node: Pick<Node, "type" | "width" | "height" | "style">,
): Pick<Node, "width" | "height"> {
  if (!resizableNodeTypes.has(node.type ?? "")) return {};
  const width = node.width ?? node.style?.width;
  const height = node.height ?? node.style?.height;
  return {
    ...(typeof width === "number" && { width }),
    ...(typeof height === "number" && { height }),
  };
}

export function normalizeScriptNodeDimensions(node: Node): Node {
  if (resizableNodeTypes.has(node.type ?? "")) return node;
  const normalized = { ...node };
  delete normalized.width;
  delete normalized.height;
  if (node.style) {
    normalized.style = { ...node.style };
    delete normalized.style.width;
    delete normalized.style.height;
  }
  return normalized;
}

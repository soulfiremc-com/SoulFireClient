import type { Edge, Node } from "@xyflow/react";
import { nodeDataString } from "@/lib/script-node-data";

const PASS_THROUGH_TYPES = new Set(["layout.reroute", "layout.debug"]);

/** The key of one output port in the map that debugSources returns. */
export function outputKey(nodeId: string, handle: string) {
  return `${nodeId}\u0000${handle}`;
}

/**
 * Finds the executed output that feeds each debug node.
 *
 * The server removes reroutes, debug nodes, and groups before it runs a
 * script, so it only reports outputs of the remaining nodes. This follows
 * the same rewiring backwards from every debug node. The result maps
 * `outputKey(node, port)` to the debug nodes that show that output.
 */
export function debugSources(
  nodes: readonly Node[],
  edges: readonly Edge[],
): Map<string, string[]> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }
  // Like the server, the last interface node of a group is the one it uses.
  const groupInputs = new Map<string, string>();
  const groupOutputs = new Map<string, string>();
  for (const node of nodes) {
    const parent = nodeDataString(node.data, "parentGroupId");
    if (!parent) continue;
    if (node.type === "layout.group_input") groupInputs.set(parent, node.id);
    if (node.type === "layout.group_output") groupOutputs.set(parent, node.id);
  }

  const sourcesOf = (
    edgesIn: readonly Edge[],
    visited: Set<string>,
    found: Set<string>,
  ) => {
    for (const edge of edgesIn) {
      const handle = edge.sourceHandle ?? "";
      const key = outputKey(edge.source, handle);
      if (visited.has(key)) continue;
      visited.add(key);
      const source = byId.get(edge.source);
      const type = source?.type ?? "";
      if (!source || type === "layout.frame" || type === "layout.note") {
        continue;
      }
      if (PASS_THROUGH_TYPES.has(type)) {
        // Every wire into a pass-through node feeds every wire out of it.
        sourcesOf(incoming.get(source.id) ?? [], visited, found);
      } else if (type === "layout.group_input") {
        const group = nodeDataString(source.data, "parentGroupId");
        if (!group || groupInputs.get(group) !== source.id) continue;
        sourcesOf(
          (incoming.get(group) ?? []).filter(
            (wire) => (wire.targetHandle ?? "") === handle,
          ),
          visited,
          found,
        );
      } else if (type === "layout.group") {
        const output = groupOutputs.get(source.id);
        if (!output) continue;
        sourcesOf(
          (incoming.get(output) ?? []).filter(
            (wire) => (wire.targetHandle ?? "") === handle,
          ),
          visited,
          found,
        );
      } else if (type !== "layout.group_output") {
        found.add(key);
      }
    }
  };

  const result = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.type !== "layout.debug") continue;
    const found = new Set<string>();
    sourcesOf(incoming.get(node.id) ?? [], new Set(), found);
    for (const key of found) {
      const list = result.get(key) ?? [];
      list.push(node.id);
      result.set(key, list);
    }
  }
  return result;
}

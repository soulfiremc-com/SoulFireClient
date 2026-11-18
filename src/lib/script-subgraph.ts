import type { Edge, Node, XYPosition } from "@xyflow/react";
import { assertDefined } from "@/lib/assert-defined";
import { nodeDataString } from "@/lib/script-node-data";

export function selectedSubgraph(
  nodes: Node[],
  edges: Edge[],
  groupId: string | null,
) {
  const children = new Map<string, string[]>();
  const pending: string[] = [];
  for (const node of nodes) {
    const parent = nodeDataString(node.data, "parentGroupId");
    if (parent) {
      const siblings = children.get(parent) ?? [];
      siblings.push(node.id);
      children.set(parent, siblings);
    }
    if (node.selected && (parent ?? null) === groupId) pending.push(node.id);
  }

  const ids = new Set(pending);
  // The loop also visits children pushed while it runs.
  for (const id of pending) {
    for (const child of children.get(id) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      pending.push(child);
    }
  }

  return {
    nodes: nodes.filter((node) => ids.has(node.id)),
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

export function subgraphRoots(nodes: Node[]) {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes.filter(
    (node) => !ids.has(nodeDataString(node.data, "parentGroupId") ?? ""),
  );
}

export function cloneSubgraph(
  graph: { nodes: Node[]; edges: Edge[] },
  groupId: string | null,
  offset: XYPosition,
) {
  const ids = new Map(
    graph.nodes.map((node) => [node.id, crypto.randomUUID()]),
  );
  // Every node gets a copy ID above, and edges are filtered to copied nodes.
  const copyId = (id: string) =>
    assertDefined(ids.get(id), `Missing copy ID for node ${id}`);
  return {
    nodes: graph.nodes.map((node): Node => {
      const parent = ids.get(nodeDataString(node.data, "parentGroupId") ?? "");
      return {
        ...node,
        id: copyId(node.id),
        // Each group has its own canvas. Only roots move in the target canvas.
        position: parent
          ? { ...node.position }
          : { x: node.position.x + offset.x, y: node.position.y + offset.y },
        data: {
          ...node.data,
          parentGroupId: parent ?? groupId ?? undefined,
          parentFrameId: ids.get(
            nodeDataString(node.data, "parentFrameId") ?? "",
          ),
          ...(Array.isArray(node.data["containedNodes"]) && {
            containedNodes: node.data["containedNodes"].flatMap(
              (id: string) => {
                const copy = ids.get(id);
                return copy ? [copy] : [];
              },
            ),
          }),
        },
        selected: !parent,
      };
    }),
    edges: graph.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      // oxlint-disable-next-line oxc/no-map-spread -- the copies must not change the edges of the source graph
      .map((edge): Edge => ({
        ...edge,
        id: crypto.randomUUID(),
        source: copyId(edge.source),
        target: copyId(edge.target),
        selected: false,
      })),
  };
}

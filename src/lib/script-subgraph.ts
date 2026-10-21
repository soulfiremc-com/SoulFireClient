import type { Edge, Node, XYPosition } from "@xyflow/react";

export function selectedSubgraph(
  nodes: Node[],
  edges: Edge[],
  groupId: string | null,
) {
  const children = new Map<string, string[]>();
  const pending: string[] = [];
  for (const node of nodes) {
    const parent = node.data.parentGroupId as string | undefined;
    if (parent) {
      const siblings = children.get(parent) ?? [];
      siblings.push(node.id);
      children.set(parent, siblings);
    }
    if (node.selected && (parent ?? null) === groupId) pending.push(node.id);
  }

  const ids = new Set(pending);
  for (let index = 0; index < pending.length; index++) {
    for (const child of children.get(pending[index]) ?? []) {
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
  return nodes.filter((node) => !ids.has(node.data.parentGroupId as string));
}

export function cloneSubgraph(
  graph: { nodes: Node[]; edges: Edge[] },
  groupId: string | null,
  offset: XYPosition,
) {
  const ids = new Map(
    graph.nodes.map((node) => [node.id, crypto.randomUUID()]),
  );
  return {
    nodes: graph.nodes.map((node): Node => {
      const parent = ids.get(node.data.parentGroupId as string);
      return {
        ...node,
        id: ids.get(node.id)!,
        // Each group has its own canvas. Only roots move in the target canvas.
        position: parent
          ? { ...node.position }
          : { x: node.position.x + offset.x, y: node.position.y + offset.y },
        data: {
          ...node.data,
          parentGroupId: parent ?? groupId ?? undefined,
          parentFrameId: ids.get(node.data.parentFrameId as string),
          ...(Array.isArray(node.data.containedNodes) && {
            containedNodes: node.data.containedNodes.flatMap((id: string) => {
              const copy = ids.get(id);
              return copy ? [copy] : [];
            }),
          }),
        },
        selected: !parent,
      };
    }),
    edges: graph.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge): Edge => ({
        ...edge,
        id: crypto.randomUUID(),
        source: ids.get(edge.source)!,
        target: ids.get(edge.target)!,
        selected: false,
      })),
  };
}

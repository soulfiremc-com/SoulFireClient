/**
 * Pure graph edits for the script editor. Each function takes the current
 * nodes and edges and returns the edited graph, or null when nothing changes.
 * The store applies the result and records it for undo.
 */
import type { Connection, Edge, Node, XYPosition } from "@xyflow/react";
import {
  getNodeDefinition,
  isPortMultiInput,
  isTypeCompatible,
} from "@/components/script-editor/nodes/types";
import { getPortType } from "@/components/script-editor/edges/connection-validation";
import { optionalEdgeFields } from "@/lib/script-edge-fields";
import {
  type EdgeShapes,
  edgeShapes,
  polylineDistance,
} from "@/lib/script-edge-geometry";
import { GROUP_INTERFACE_NODE_WIDTH } from "@/lib/script-node-layout";
import {
  isGroupInterfaceNode,
  parentGroupOf,
  withParentGroup,
} from "@/lib/script-subgraph";

export interface ScriptGraph {
  nodes: Node[];
  edges: Edge[];
}

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 100;

const generateId = () => crypto.randomUUID();

function nodeSize(node: Node) {
  return {
    width:
      node.measured?.width ??
      node.width ??
      node.initialWidth ??
      DEFAULT_NODE_WIDTH,
    height:
      node.measured?.height ??
      node.height ??
      node.initialHeight ??
      DEFAULT_NODE_HEIGHT,
  };
}

/** The nodes and edges on one group's canvas. Positions share one space. */
export function canvasGraph(
  nodes: Node[],
  edges: Edge[],
  groupId: string | null,
): ScriptGraph {
  const canvasNodes = nodes.filter((node) => parentGroupOf(node) === groupId);
  const ids = new Set(canvasNodes.map((node) => node.id));
  return {
    nodes: canvasNodes,
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

/** The selected nodes on one group's canvas. */
export function canvasSelection(nodes: Node[], groupId: string | null) {
  return nodes.filter(
    (node) => node.selected && parentGroupOf(node) === groupId,
  );
}

// ==================== Edge order ====================

function edgeOrder(edge: Edge): number | undefined {
  const order = edge.data?.["order"];
  return typeof order === "number" && Number.isFinite(order)
    ? order
    : undefined;
}

function withoutOrder(edge: Edge): Edge {
  const { order: _order, ...data } = edge.data ?? {};
  return { ...edge, data };
}

/**
 * Numbers the wires of each multi-input port from 0 and removes the order
 * from every other wire whose target port is known. The server sorts all
 * outgoing wires by order, so a leftover order would reorder branches.
 */
export function normalizeEdgeOrders(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeTypes = new Map(nodes.map((node) => [node.id, node.type ?? ""]));
  const multiInputGroups = new Map<string, Edge[]>();
  const strip = new Set<string>();
  for (const edge of edges) {
    const targetType = nodeTypes.get(edge.target);
    const handle = edge.targetHandle;
    if (targetType === undefined || !handle) continue;
    if (isPortMultiInput(targetType, handle)) {
      const key = `${edge.target}:${handle}`;
      const group = multiInputGroups.get(key) ?? [];
      group.push(edge);
      multiInputGroups.set(key, group);
    } else if (
      edgeOrder(edge) !== undefined &&
      // Layout nodes never have multi-input ports. Other types are only
      // known once the server sent their definitions.
      (targetType.startsWith("layout.") || getNodeDefinition(targetType))
    ) {
      strip.add(edge.id);
    }
  }

  const orders = new Map<string, number>();
  for (const group of multiInputGroups.values()) {
    const sorted = group.toSorted(
      (a, b) =>
        (edgeOrder(a) ?? Number.MAX_SAFE_INTEGER) -
        (edgeOrder(b) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const [index, edge] of sorted.entries()) orders.set(edge.id, index);
  }

  if (orders.size === 0 && strip.size === 0) return edges;
  const next = edges.map((edge) => {
    if (strip.has(edge.id)) return withoutOrder(edge);
    const order = orders.get(edge.id);
    if (order === undefined || edgeOrder(edge) === order) return edge;
    return { ...edge, data: { ...edge.data, order } };
  });
  return next.every((edge, index) => edge === edges[index]) ? edges : next;
}

// ==================== Wiring ====================

/**
 * Whether a new wire into this input replaces the wire that is already
 * there. Multi-input ports and execution inputs accept several wires.
 */
export function isSingleWireInput(
  nodes: Node[],
  nodeId: string,
  handleId: string | null | undefined,
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || !handleId) return false;
  return (
    !isPortMultiInput(node.type ?? "", handleId) &&
    getPortType(nodes, nodeId, handleId) !== "execution"
  );
}

const sameConnection = (edge: Edge, connection: Connection) =>
  edge.source === connection.source &&
  (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
  edge.target === connection.target &&
  (edge.targetHandle ?? null) === (connection.targetHandle ?? null);

/**
 * Adds a wire. A data input that takes one wire drops its old wire. A
 * multi-input port appends the wire, unless `order` places it. An
 * execution input keeps every wire, because any of them can start the node.
 */
export function connectEdge(
  nodes: Node[],
  edges: Edge[],
  connection: Connection,
  options: { id?: string; order?: number | undefined } = {},
): Edge[] {
  if (edges.some((edge) => sameConnection(edge, connection))) return edges;
  const execution =
    getPortType(nodes, connection.source, connection.sourceHandle) ===
      "execution" ||
    getPortType(nodes, connection.target, connection.targetHandle) ===
      "execution";
  const kept =
    !execution &&
    isSingleWireInput(nodes, connection.target, connection.targetHandle)
      ? edges.filter(
          (edge) =>
            !(
              edge.target === connection.target &&
              edge.targetHandle === connection.targetHandle
            ),
        )
      : edges;
  const edgeType = execution ? "execution" : "data";
  const targetType = nodes.find((n) => n.id === connection.target)?.type;
  const multiInput =
    !!connection.targetHandle &&
    isPortMultiInput(targetType ?? "", connection.targetHandle);
  const order = multiInput
    ? (options.order ??
      // Appends after every wire already on the port.
      kept
        .filter(
          (edge) =>
            edge.target === connection.target &&
            edge.targetHandle === connection.targetHandle,
        )
        .reduce((max, edge) => Math.max(max, edgeOrder(edge) ?? -1), -1) + 1)
    : undefined;
  return normalizeEdgeOrders(nodes, [
    ...kept,
    {
      id: options.id ?? generateId(),
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      targetHandle: connection.targetHandle,
      type: edgeType,
      data: { edgeType, ...(order !== undefined && { order }) },
    },
  ]);
}

/**
 * Moves one end of a wire. The wire keeps its ID, and keeps its place in a
 * multi-input port when its target does not change.
 */
export function reconnectEdge(
  nodes: Node[],
  edges: Edge[],
  oldEdge: Edge,
  connection: Connection,
): Edge[] {
  const sameInput =
    oldEdge.target === connection.target &&
    oldEdge.targetHandle === connection.targetHandle;
  return connectEdge(
    nodes,
    edges.filter((edge) => edge.id !== oldEdge.id),
    connection,
    { id: oldEdge.id, order: sameInput ? edgeOrder(oldEdge) : undefined },
  );
}

/** Find the edge closest to a point within a threshold, in flow coordinates. */
export function findClosestEdge(
  nodes: Node[],
  edges: Edge[],
  point: XYPosition,
  threshold: number,
  drawn?: EdgeShapes,
): Edge | null {
  const shapes = edgeShapes(nodes, edges, drawn);
  let closest: Edge | null = null;
  let closestDist = threshold;
  for (const edge of edges) {
    const shape = shapes.get(edge.id);
    if (!shape) continue;
    const d = polylineDistance(point, shape);
    if (d < closestDist) {
      closestDist = d;
      closest = edge;
    }
  }
  return closest;
}

/** Splits a wire with a reroute node at a point. */
export function insertReroute(
  graph: ScriptGraph,
  edgeId: string,
  position: XYPosition,
  groupId: string | null,
): ScriptGraph | null {
  const { nodes, edges } = graph;
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const reroute: Node = {
    id: generateId(),
    type: "layout.reroute",
    position,
    data: withParentGroup(
      { resolvedType: getPortType(nodes, edge.source, edge.sourceHandle) },
      groupId,
    ),
  };
  const nextNodes = [...nodes, reroute];
  return {
    nodes: nextNodes,
    edges: normalizeEdgeOrders(nextNodes, [
      ...edges.filter((e) => e.id !== edgeId),
      {
        id: generateId(),
        source: edge.source,
        target: reroute.id,
        targetHandle: "in",
        type: edge.type,
        ...optionalEdgeFields({
          sourceHandle: edge.sourceHandle,
          data: edge.data,
        }),
      },
      {
        id: generateId(),
        source: reroute.id,
        sourceHandle: "out",
        target: edge.target,
        type: edge.type,
        ...optionalEdgeFields({
          targetHandle: edge.targetHandle,
          data: edge.data,
        }),
      },
    ]),
  };
}

/**
 * Places a node in the middle of a wire, using the first ports of the node
 * that fit the wire's types. Returns null when the node has no fitting ports.
 */
export function insertNodeOnEdge(
  graph: ScriptGraph,
  nodeId: string,
  edgeId: string,
): ScriptGraph | null {
  const { nodes, edges } = graph;
  const edge = edges.find((e) => e.id === edgeId);
  const node = nodes.find((n) => n.id === nodeId);
  if (!edge || !node) return null;

  const sourceType = getPortType(nodes, edge.source, edge.sourceHandle);
  const targetType = getPortType(nodes, edge.target, edge.targetHandle);
  const isExecutionEdge = sourceType === "execution";
  const definition = getNodeDefinition(node.type ?? "");

  let inputHandle = "in";
  let outputHandle = "out";
  if (definition) {
    const input = definition.inputs.find((p) =>
      isExecutionEdge
        ? p.type === "execution"
        : p.type !== "execution" && isTypeCompatible(sourceType, p.type),
    );
    const output = definition.outputs.find((p) =>
      isExecutionEdge
        ? p.type === "execution"
        : p.type !== "execution" && isTypeCompatible(p.type, targetType),
    );
    if (!input || !output) return null;
    inputHandle = input.id;
    outputHandle = output.id;
  }

  return {
    nodes,
    edges: normalizeEdgeOrders(nodes, [
      ...edges.filter((e) => e.id !== edgeId),
      {
        id: generateId(),
        source: edge.source,
        target: nodeId,
        targetHandle: inputHandle,
        type: edge.type,
        ...optionalEdgeFields({
          sourceHandle: edge.sourceHandle,
          data: edge.data,
        }),
      },
      {
        id: generateId(),
        source: nodeId,
        sourceHandle: outputHandle,
        target: edge.target,
        type: edge.type,
        ...optionalEdgeFields({
          targetHandle: edge.targetHandle,
          data: edge.data,
        }),
      },
    ]),
  };
}

// ==================== Frames ====================

const FRAME_PADDING = 40;

/** A frame around the given nodes on one canvas. Nodes on other canvases are skipped. */
export function createFrame(
  nodes: Node[],
  nodeIds: readonly string[],
  groupId: string | null,
  label?: string,
): Node | null {
  const ids = new Set(nodeIds);
  const framed = nodes.filter(
    (node) => ids.has(node.id) && parentGroupOf(node) === groupId,
  );
  if (framed.length === 0) return null;

  const minX = Math.min(...framed.map((n) => n.position.x)) - FRAME_PADDING;
  const minY = Math.min(...framed.map((n) => n.position.y)) - FRAME_PADDING;
  const maxX =
    Math.max(...framed.map((n) => n.position.x + nodeSize(n).width)) +
    FRAME_PADDING;
  const maxY =
    Math.max(...framed.map((n) => n.position.y + nodeSize(n).height)) +
    FRAME_PADDING;

  return {
    id: generateId(),
    type: "layout.frame",
    position: { x: minX, y: minY },
    // Without a label, the frame shows its name in the viewer's language.
    data: withParentGroup(label === undefined ? {} : { label }, groupId),
    width: maxX - minX,
    height: maxY - minY,
    // Frames render behind other nodes.
    zIndex: -1,
  };
}

// ==================== Groups ====================

/** Moves the selected nodes on a canvas into a new group. */
export function groupSelection(
  graph: ScriptGraph,
  groupId: string | null,
): ScriptGraph | null {
  const { nodes, edges } = graph;
  // The enclosing group's interface nodes must stay on its canvas.
  const selectedNodes = canvasSelection(nodes, groupId).filter(
    (n) => !isGroupInterfaceNode(n),
  );
  if (selectedNodes.length === 0) return null;
  const selectedIds = new Set(selectedNodes.map((n) => n.id));

  const incomingEdges = edges.filter(
    (e) => !selectedIds.has(e.source) && selectedIds.has(e.target),
  );
  const outgoingEdges = edges.filter(
    (e) => selectedIds.has(e.source) && !selectedIds.has(e.target),
  );

  const groupInputs = incomingEdges.map((e, i) => ({
    id: `group-in-${i}`,
    type: getPortType(nodes, e.source, e.sourceHandle),
    label: e.targetHandle || `Input ${i + 1}`,
    edge: e,
  }));
  const groupOutputs = outgoingEdges.map((e, i) => ({
    id: `group-out-${i}`,
    type: getPortType(nodes, e.source, e.sourceHandle),
    label: e.sourceHandle || `Output ${i + 1}`,
    edge: e,
  }));
  const ports = (list: typeof groupInputs) =>
    list.map(({ id, type, label }) => ({ id, type, label }));

  const centerX =
    selectedNodes.reduce((sum, n) => sum + n.position.x, 0) /
    selectedNodes.length;
  const centerY =
    selectedNodes.reduce((sum, n) => sum + n.position.y, 0) /
    selectedNodes.length;

  const groupNode: Node = {
    id: generateId(),
    type: "layout.group",
    position: { x: centerX - 80, y: centerY - 40 },
    data: withParentGroup(
      { inputs: ports(groupInputs), outputs: ports(groupOutputs) },
      groupId,
    ),
  };

  // Keep interfaces outside the contents, including wide or spread-out nodes.
  const contentLeft = Math.min(...selectedNodes.map((n) => n.position.x));
  const contentRight = Math.max(
    ...selectedNodes.map((n) => n.position.x + nodeSize(n).width),
  );
  const contentTop = Math.min(...selectedNodes.map((n) => n.position.y));
  const interfaceGap = 80;

  const groupInputNode: Node = {
    id: generateId(),
    type: "layout.group_input",
    position: {
      x:
        contentLeft -
        groupNode.position.x -
        GROUP_INTERFACE_NODE_WIDTH -
        interfaceGap,
      y: contentTop - groupNode.position.y,
    },
    data: { parentGroupId: groupNode.id, outputs: ports(groupInputs) },
  };
  const groupOutputNode: Node = {
    id: generateId(),
    type: "layout.group_output",
    position: {
      x: contentRight - groupNode.position.x + interfaceGap,
      y: contentTop - groupNode.position.y,
    },
    data: { parentGroupId: groupNode.id, inputs: ports(groupOutputs) },
  };

  // Positions become relative to the group origin so ungrouping restores them.
  // oxlint-disable-next-line oxc/no-map-spread -- the store keeps the previous graph for undo, so nodes must not change in place
  const updatedNodes = nodes.map((n) => {
    if (!selectedIds.has(n.id)) return n;
    return {
      ...n,
      data: { ...n.data, parentGroupId: groupNode.id },
      position: {
        x: n.position.x - groupNode.position.x,
        y: n.position.y - groupNode.position.y,
      },
      selected: false,
    };
  });

  // Crossing wires now end at the group outside and at its interface inside.
  const rewired: Edge[] = [];
  for (const input of groupInputs) {
    const e = input.edge;
    rewired.push(
      { ...e, id: generateId(), target: groupNode.id, targetHandle: input.id },
      {
        id: generateId(),
        source: groupInputNode.id,
        sourceHandle: input.id,
        target: e.target,
        type: e.type,
        ...optionalEdgeFields({ targetHandle: e.targetHandle, data: e.data }),
      },
    );
  }
  for (const output of groupOutputs) {
    const e = output.edge;
    rewired.push(
      { ...e, id: generateId(), source: groupNode.id, sourceHandle: output.id },
      {
        id: generateId(),
        source: e.source,
        target: groupOutputNode.id,
        targetHandle: output.id,
        type: e.type,
        ...optionalEdgeFields({ sourceHandle: e.sourceHandle, data: e.data }),
      },
    );
  }

  const crossing = new Set(
    [...incomingEdges, ...outgoingEdges].map((e) => e.id),
  );
  const nextNodes = [
    ...updatedNodes,
    groupNode,
    groupInputNode,
    groupOutputNode,
  ];
  return {
    nodes: nextNodes,
    edges: normalizeEdgeOrders(nextNodes, [
      ...edges.filter((e) => !crossing.has(e.id)),
      ...rewired,
    ]),
  };
}

/** Replaces a group with its contents on the group's own canvas. */
export function ungroup(
  graph: ScriptGraph,
  groupNodeId: string,
): ScriptGraph | null {
  const { nodes, edges } = graph;
  const groupNode = nodes.find(
    (n) => n.id === groupNodeId && n.type === "layout.group",
  );
  if (!groupNode) return null;
  const parentId = parentGroupOf(groupNode);

  const innerNodes = nodes.filter((n) => parentGroupOf(n) === groupNodeId);
  const groupInputNode = innerNodes.find(
    (n) => n.type === "layout.group_input",
  );
  const groupOutputNode = innerNodes.find(
    (n) => n.type === "layout.group_output",
  );

  const nodesFromGroup: Node[] = [];
  for (const n of innerNodes) {
    if (isGroupInterfaceNode(n)) continue;
    nodesFromGroup.push({
      ...n,
      data: withParentGroup(n.data, parentId),
      position: {
        x: n.position.x + groupNode.position.x,
        y: n.position.y + groupNode.position.y,
      },
    });
  }

  let rewiredEdges = [...edges];
  for (const externalEdge of edges.filter((e) => e.target === groupNodeId)) {
    const internalEdges = edges.filter(
      (e) =>
        e.source === groupInputNode?.id &&
        e.sourceHandle === externalEdge.targetHandle,
    );
    for (const internalEdge of internalEdges) {
      const {
        targetHandle: _targetHandle,
        data: _data,
        ...rest
      } = externalEdge;
      rewiredEdges.push({
        ...rest,
        id: generateId(),
        target: internalEdge.target,
        ...optionalEdgeFields({
          targetHandle: internalEdge.targetHandle,
          data: internalEdge.data,
        }),
      });
    }
  }

  // Pass-through wires now have real upstream sources. Resolve outputs
  // after removing the input interface's original edges.
  rewiredEdges = rewiredEdges.filter(
    (e) => e.source !== groupInputNode?.id && e.target !== groupInputNode?.id,
  );

  for (const externalEdge of edges.filter((e) => e.source === groupNodeId)) {
    const internalEdges = rewiredEdges.filter(
      (e) =>
        e.target === groupOutputNode?.id &&
        e.targetHandle === externalEdge.sourceHandle,
    );
    for (const internalEdge of internalEdges) {
      const { sourceHandle: _sourceHandle, ...rest } = externalEdge;
      rewiredEdges.push({
        ...rest,
        id: generateId(),
        source: internalEdge.source,
        ...optionalEdgeFields({ sourceHandle: internalEdge.sourceHandle }),
      });
    }
  }

  // Remove the group node and every interface node, with their edges.
  const removed = new Set([
    groupNodeId,
    ...innerNodes.filter((n) => isGroupInterfaceNode(n)).map((n) => n.id),
  ]);
  const nextNodes = [
    ...nodes.filter(
      (n) => !removed.has(n.id) && parentGroupOf(n) !== groupNodeId,
    ),
    ...nodesFromGroup,
  ];
  return {
    nodes: nextNodes,
    edges: normalizeEdgeOrders(
      nextNodes,
      rewiredEdges.filter(
        (e) => !removed.has(e.source) && !removed.has(e.target),
      ),
    ),
  };
}

// ==================== Loading ====================

// Older clients stored frame membership. Nothing reads it.
const RETIRED_NODE_FIELDS = ["containedNodes", "parentFrameId"];

/**
 * Repairs graphs from older clients before they reach the editor:
 * - A node whose group is missing, is not a group, or sits in a group cycle
 *   moves to the root canvas. Without this it is hidden but still runs.
 * - A group input or output node without a group is removed with its wires.
 * - Wires to missing nodes are removed, and wire orders are normalized.
 * - Frame membership fields that nothing reads are removed.
 * Returns the same arrays when nothing needed repair.
 */
export function normalizeScriptGraph(graph: ScriptGraph): ScriptGraph {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string | null>();
  for (const node of graph.nodes) {
    const parent = parentGroupOf(node);
    parents.set(
      node.id,
      parent && byId.get(parent)?.type === "layout.group" ? parent : null,
    );
  }
  // Break group cycles at the group where the walk returns to itself.
  for (const node of graph.nodes) {
    const seen = new Set<string>();
    let current: string | null = node.id;
    while (current !== null) {
      seen.add(current);
      const parent: string | null = parents.get(current) ?? null;
      if (parent !== null && seen.has(parent)) {
        parents.set(current, null);
        break;
      }
      current = parent;
    }
  }

  let changed = false;
  const nodes: Node[] = [];
  for (const node of graph.nodes) {
    const parent = parents.get(node.id) ?? null;
    if (parent === null && isGroupInterfaceNode(node)) {
      changed = true;
      continue;
    }
    const retired = RETIRED_NODE_FIELDS.some((key) => key in node.data);
    if (parent === parentGroupOf(node) && !retired) {
      nodes.push(node);
      continue;
    }
    changed = true;
    const {
      containedNodes: _containedNodes,
      parentFrameId: _parentFrameId,
      ...data
    } = withParentGroup(node.data, parent);
    nodes.push({ ...node, data });
  }

  const ids = new Set(nodes.map((node) => node.id));
  const kept = graph.edges.filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  );
  const edges = normalizeEdgeOrders(
    nodes,
    kept.length === graph.edges.length ? graph.edges : kept,
  );
  return changed || edges !== graph.edges ? { nodes, edges } : graph;
}

// ==================== Selection ====================

/**
 * Sets the selection on one canvas. Nodes on other canvases keep theirs.
 * Unchanged nodes keep their identity.
 */
export function selectOnCanvas(
  nodes: Node[],
  groupId: string | null,
  selected: (node: Node) => boolean,
): Node[] {
  return nodes.map((node) => {
    if (parentGroupOf(node) !== groupId) return node;
    const next = selected(node);
    return !!node.selected === next ? node : { ...node, selected: next };
  });
}

/** The nodes on the shortest path between two nodes, ignoring wire direction. */
export function shortestPath(
  edges: Edge[],
  fromNodeId: string,
  toNodeId: string,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [
      ...(adjacency.get(edge.source) ?? []),
      edge.target,
    ]);
    adjacency.set(edge.target, [
      ...(adjacency.get(edge.target) ?? []),
      edge.source,
    ]);
  }

  const parent = new Map<string, string | null>([[fromNodeId, null]]);
  const queue = [fromNodeId];
  // The loop also visits nodes pushed while it runs.
  for (const current of queue) {
    if (current === toNodeId) break;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (parent.has(neighbor)) continue;
      parent.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  // Without a path, the result is just both nodes.
  if (!parent.has(toNodeId)) return new Set([fromNodeId, toNodeId]);
  const path = new Set<string>();
  for (
    let current: string | null = toNodeId;
    current !== null;
    current = parent.get(current) ?? null
  ) {
    path.add(current);
  }
  return path;
}

/** The start nodes and every node wired to them in the given direction. */
export function linkedNodes(
  edges: Edge[],
  start: Iterable<string>,
  direction: "upstream" | "downstream" | "both",
): Set<string> {
  const next = new Map<string, string[]>();
  const link = (from: string, to: string) =>
    next.set(from, [...(next.get(from) ?? []), to]);
  for (const edge of edges) {
    if (direction !== "upstream") link(edge.source, edge.target);
    if (direction !== "downstream") link(edge.target, edge.source);
  }

  const result = new Set(start);
  // The loop also visits nodes added while it runs.
  for (const current of result) {
    for (const neighbor of next.get(current) ?? []) result.add(neighbor);
  }
  return result;
}

// ==================== Layout ====================

export type AlignDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerH"
  | "centerV";

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Aligns the selected nodes on a canvas. Needs at least two nodes. */
export function alignSelection(
  nodes: Node[],
  groupId: string | null,
  direction: AlignDirection,
): Node[] | null {
  const selected = canvasSelection(nodes, groupId);
  if (selected.length < 2) return null;
  const boxes = selected.map((n) => ({ ...n.position, ...nodeSize(n) }));
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const centerX = average(boxes.map((b) => b.x + b.width / 2));
  const centerY = average(boxes.map((b) => b.y + b.height / 2));
  const placements: Record<
    AlignDirection,
    (size: { width: number; height: number }) => Partial<XYPosition>
  > = {
    left: () => ({ x: left }),
    right: ({ width }) => ({ x: right - width }),
    top: () => ({ y: top }),
    bottom: ({ height }) => ({ y: bottom - height }),
    centerH: ({ width }) => ({ x: centerX - width / 2 }),
    centerV: ({ height }) => ({ y: centerY - height / 2 }),
  };
  const place = placements[direction];

  const ids = new Set(selected.map((n) => n.id));
  return nodes.map((n) => {
    if (!ids.has(n.id)) return n;
    return { ...n, position: { ...n.position, ...place(nodeSize(n)) } };
  });
}

/**
 * Spaces the selected nodes on a canvas evenly between the outermost two.
 * Needs at least three nodes.
 */
export function distributeSelection(
  nodes: Node[],
  groupId: string | null,
  direction: "horizontal" | "vertical",
): Node[] | null {
  const axis = direction === "horizontal" ? "x" : "y";
  const sorted = canvasSelection(nodes, groupId).toSorted(
    (a, b) => a.position[axis] - b.position[axis],
  );
  const first = sorted[0];
  const last = sorted.at(-1);
  if (sorted.length < 3 || !first || !last) return null;

  const step =
    (last.position[axis] - first.position[axis]) / (sorted.length - 1);
  const positions = new Map(
    sorted.map((node, i) => [node.id, first.position[axis] + i * step]),
  );
  return nodes.map((n) => {
    const value = positions.get(n.id);
    return value === undefined
      ? n
      : { ...n, position: { ...n.position, [axis]: value } };
  });
}

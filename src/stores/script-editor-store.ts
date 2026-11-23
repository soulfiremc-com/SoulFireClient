import { batch, createStore } from "@tanstack/store";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  reconnectEdge,
  type XYPosition,
} from "@xyflow/react";
import {
  getEdgeStyle,
  getNodeDefinition,
  getPortTypeFromDefinition,
  isPortMultiInput,
  isTypeCompatible,
  type PortType,
} from "@/components/script-editor/nodes/types";
import { mergeExecutionLogs } from "@/lib/script-logs";
import { optionalEdgeFields } from "@/lib/script-edge-fields";
import { sameScriptDocument } from "@/lib/script-document";
import { GROUP_INTERFACE_NODE_WIDTH } from "@/lib/script-node-layout";
import { outputKey } from "@/lib/script-debug-sources";
import {
  type EdgeShapes,
  edgeShapes,
  polylineCrossesSegment,
  polylineDistance,
} from "@/lib/script-edge-geometry";
import {
  cloneSubgraph,
  isGroupInterfaceNode,
  selectedSubgraph,
  subgraphRoots,
} from "@/lib/script-subgraph";
import {
  createEditorDerivedStores,
  indexDiagnostics,
} from "./script-editor-derived";
import type {
  DebugValue,
  ScriptDocumentData,
  ScriptDocumentState,
  ScriptEditorActions,
  ScriptEditorUIState,
  ScriptExecutionState,
  ScriptGraphSnapshot,
  ScriptHistoryState,
  ScriptValidationState,
} from "./script-editor-types";
import { nodeDataString, nodeDataStrings } from "@/lib/script-node-data";

export type { PortType };

function getMultiInputOrder(edge: Edge): number {
  const rawOrder = Number((edge.data as { order?: number } | undefined)?.order);
  return Number.isFinite(rawOrder) ? rawOrder : Number.MAX_SAFE_INTEGER;
}

function normalizeMultiInputEdgeOrders(nodes: Node[], edges: Edge[]): Edge[] {
  const groupedEdges = new Map<string, Edge[]>();
  const nodeTypes = new Map(nodes.map((node) => [node.id, node.type ?? ""]));
  for (const edge of edges) {
    const targetType = nodeTypes.get(edge.target);
    const targetHandle = edge.targetHandle;
    if (
      targetType === undefined ||
      !targetHandle ||
      !isPortMultiInput(targetType, targetHandle)
    ) {
      continue;
    }

    const key = `${edge.target}:${targetHandle}`;
    const group = groupedEdges.get(key) ?? [];
    group.push(edge);
    groupedEdges.set(key, group);
  }

  const normalizedOrders = new Map<string, number>();
  for (const group of groupedEdges.values()) {
    group
      .slice()
      .toSorted((a, b) => getMultiInputOrder(a) - getMultiInputOrder(b))
      .forEach((edge, index) => {
        normalizedOrders.set(edge.id, index);
      });
  }

  return edges.map((edge) => {
    const nextOrder = normalizedOrders.get(edge.id);
    if (nextOrder === undefined) {
      return edge;
    }

    const currentOrder =
      (edge.data as { order?: number } | undefined)?.order ?? -1;
    if (currentOrder === nextOrder) {
      return edge;
    }

    return {
      ...edge,
      data: {
        ...edge.data,
        order: nextOrder,
      },
    };
  });
}

function assignEdgeOrder(
  nodes: Node[],
  edges: Edge[],
  edge: Connection & { type: string; data: Record<string, unknown> },
): Connection & { type: string; data: Record<string, unknown> } {
  const targetNode = nodes.find((n) => n.id === edge.target);
  const targetHandle = edge.targetHandle;
  if (
    !targetNode ||
    !targetHandle ||
    !isPortMultiInput(targetNode.type ?? "", targetHandle)
  ) {
    return edge;
  }

  const nextOrder =
    edges
      .filter(
        (e) => e.target === edge.target && e.targetHandle === targetHandle,
      )
      .map((e) => (e.data as { order?: number } | undefined)?.order ?? -1)
      .reduce((max, value) => Math.max(max, value), -1) + 1;

  return {
    ...edge,
    data: {
      ...(edge.data as Record<string, unknown> | undefined),
      order: nextOrder,
    },
  };
}

const HISTORY_LIMIT = 100;
const sameItems = <T>(first: readonly T[], second: readonly T[]) =>
  first === second ||
  (first.length === second.length &&
    first.every((item, index) => item === second[index]));
const HISTORY_COALESCE_MS = 1500;

// Generate unique IDs
const generateId = () => crypto.randomUUID();

// Helper to get port type from node definition
// Primary method: look up port type from node definitions
// Fallback: for layout nodes (reroute, group) that use dynamic port types
const getPortTypeForNode = (
  nodes: Node[],
  nodeId: string,
  handleId: string | null | undefined,
): PortType => {
  if (!handleId) return "any";

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return "any";

  // Try to look up from node definition
  const portType = getPortTypeFromDefinition(node.type ?? "", handleId);
  if (portType) return portType;

  // Fallback for layout nodes (reroute, group) that store resolved type in data
  const nodeData = node.data as { resolvedType?: PortType } | undefined;
  if (nodeData?.resolvedType) return nodeData.resolvedType;

  return "any";
};

/** Find the edge closest to a point within a threshold, in flow coordinates. */
const findClosestEdgeToPoint = (
  nodes: Node[],
  edges: Edge[],
  point: XYPosition,
  threshold: number,
  drawn?: EdgeShapes,
): Edge | null => {
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
};

/** The nodes and edges on one group's canvas. Positions share one space. */
function canvasGraph(nodes: Node[], edges: Edge[], groupId: string | null) {
  const canvasNodes = nodes.filter(
    (node) => (nodeDataString(node.data, "parentGroupId") ?? null) === groupId,
  );
  const ids = new Set(canvasNodes.map((node) => node.id));
  return {
    nodes: canvasNodes,
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

// An empty name means untitled. The UI shows and saves it in the user's language.
const UNTITLED_SCRIPT_NAME = "";
const emptyDocument = (): ScriptDocumentData => ({
  nodes: [],
  edges: [],
  name: UNTITLED_SCRIPT_NAME,
  description: "",
  paused: true,
  quotas: undefined,
});

export function createScriptEditorSession() {
  const document = createStore<ScriptDocumentState>({
    nodes: [],
    edges: [],
    scriptId: null,
    scriptName: UNTITLED_SCRIPT_NAME,
    scriptDescription: "",
    // New scripts start paused, so saving an unfinished graph never runs it.
    paused: true,
    quotas: undefined,
    isDirty: false,
    lastSavedPaused: true,
    lastSavedNodes: null,
    lastSavedEdges: null,
  });
  const ui = createStore<ScriptEditorUIState>({
    canvasRevision: 0,
    selectedNodeId: null,
    quickAddMenu: null,
    groupEditStack: [],
    previewEnabledNodes: new Set<string>(),

    linkCutting: {
      active: false,
      startPoint: null,
      endPoint: null,
    },
  });
  const execution = createStore<ScriptExecutionState>({
    isActive: false,
    activeNodeId: null,
    activeNodeExecutions: new Map(),
    executionLogs: [],
    previewValues: new Map<string, Record<string, unknown>>(),
    debugNodeValues: new Map<string, DebugValue[]>(),
    nodeExecutionTimes: new Map<string, number[]>(),
  });
  const validation = createStore<ScriptValidationState>({
    diagnosticsByNode: new Map(),
    validationDiagnostics: [],
  });
  const history = createStore<ScriptHistoryState>({ past: [], future: [] });
  // A gesture (dragging, resizing, rewiring) becomes one undo step.
  let gestureStart: ScriptGraphSnapshot | null = null;
  // Typing into one field merges into one undo step while it continues.
  let lastCoalesce: { key: string; at: number } | null = null;
  let canvasGesture = false;
  // The document the server last confirmed. Its paused state is lastSavedPaused.
  let savedDocument: ScriptDocumentData = emptyDocument();
  const differsFromSaved = (current: ScriptDocumentData) =>
    !sameScriptDocument(current, {
      ...savedDocument,
      paused: document.get().lastSavedPaused,
    });
  const currentCanvas = () => {
    const { nodes, edges } = document.get();
    return canvasGraph(nodes, edges, ui.get().groupEditStack.at(-1) ?? null);
  };

  const pushHistory = (entry: ScriptGraphSnapshot) => {
    history.setState((state) => ({
      past: [...state.past, entry].slice(-HISTORY_LIMIT),
      future: [],
    }));
  };
  const clearHistory = () => {
    gestureStart = null;
    lastCoalesce = null;
    history.setState(() => ({ past: [], future: [] }));
  };
  const remember = (before: ScriptGraphSnapshot, coalesceKey?: string) => {
    if (gestureStart) return;
    const now = Date.now();
    const coalesce =
      coalesceKey !== undefined &&
      lastCoalesce?.key === coalesceKey &&
      now - lastCoalesce.at < HISTORY_COALESCE_MS;
    lastCoalesce =
      coalesceKey === undefined ? null : { key: coalesceKey, at: now };
    if (!coalesce) pushHistory(before);
  };
  // Applies a graph edit and records the previous graph for undo.
  const commit = (
    updater: (state: ScriptDocumentState) => ScriptDocumentState,
    coalesceKey?: string,
  ) => {
    const before = document.get();
    document.setState(updater);
    const after = document.get();
    if (
      !sameItems(after.nodes, before.nodes) ||
      !sameItems(after.edges, before.edges)
    )
      remember({ nodes: before.nodes, edges: before.edges }, coalesceKey);
    else if (
      after.isDirty !== before.isDirty &&
      after.scriptName === before.scriptName &&
      after.scriptDescription === before.scriptDescription &&
      after.paused === before.paused &&
      after.quotas === before.quotas
    )
      // An edit that changed nothing leaves nothing new to save.
      document.setState((state) => ({ ...state, isDirty: before.isDirty }));
  };
  const restoreGraph = (entry: ScriptGraphSnapshot) => {
    const ids = new Set(entry.nodes.map((node) => node.id));
    batch(() => {
      document.setState((state) => ({
        ...state,
        nodes: entry.nodes,
        edges: entry.edges,
        // Undoing back to the saved graph leaves nothing to save.
        isDirty: differsFromSaved({
          nodes: entry.nodes,
          edges: entry.edges,
          name: state.scriptName,
          description: state.scriptDescription,
          paused: state.paused,
          quotas: state.quotas,
        }),
      }));
      ui.setState((state) => {
        // Leave groups that the restored graph no longer has.
        const missing = state.groupEditStack.findIndex((id) => !ids.has(id));
        return {
          ...state,
          groupEditStack:
            missing === -1
              ? state.groupEditStack
              : state.groupEditStack.slice(0, missing),
          selectedNodeId:
            state.selectedNodeId && ids.has(state.selectedNodeId)
              ? state.selectedNodeId
              : null,
          quickAddMenu: null,
        };
      });
    });
  };

  const derived = createEditorDerivedStores(document, ui);

  const actions: ScriptEditorActions = {
    onNodesChange: (changes) => {
      // Only mark as dirty for actual content changes, not internal React Flow events
      // like selection changes or dimension recalculations
      const hasMeaningfulChange = changes.some(
        (change) =>
          change.type === "position" ||
          change.type === "remove" ||
          change.type === "add" ||
          change.type === "replace" ||
          (change.type === "dimensions" && !!change.setAttributes),
      );
      // Drags and resizes report every frame. Record them once per gesture.
      const gestureActive = changes.some(
        (change) =>
          (change.type === "position" && change.dragging === true) ||
          (change.type === "dimensions" &&
            !!change.setAttributes &&
            change.resizing === true),
      );
      const gestureEnded =
        !gestureActive &&
        changes.some(
          (change) =>
            (change.type === "position" && change.dragging === false) ||
            (change.type === "dimensions" &&
              !!change.setAttributes &&
              change.resizing === false),
        );
      if (gestureActive && !canvasGesture) {
        canvasGesture = true;
        actions.beginHistoryGesture();
      }
      const update = (state: ScriptDocumentState) => ({
        ...state,
        nodes: applyNodeChanges(changes, document.get().nodes),
        ...(hasMeaningfulChange && { isDirty: true }),
      });
      if (hasMeaningfulChange) commit(update);
      else document.setState(update);
      if (gestureEnded && canvasGesture) {
        canvasGesture = false;
        actions.endHistoryGesture();
      }
    },
    onEdgesChange: (changes) => {
      // Only mark as dirty for actual content changes, not selection changes
      const hasMeaningfulChange = changes.some(
        (change) =>
          change.type === "remove" ||
          change.type === "add" ||
          change.type === "replace",
      );
      const nextEdges = applyEdgeChanges(changes, document.get().edges);
      if (!hasMeaningfulChange) {
        document.setState((state) => ({ ...state, edges: nextEdges }));
        return;
      }
      commit((state) => ({
        ...state,
        edges: normalizeMultiInputEdgeOrders(document.get().nodes, nextEdges),
        isDirty: true,
      }));
    },
    onConnect: (connection) => {
      // Look up port type from node definition
      const { nodes, edges } = document.get();
      const sourcePortType = getPortTypeForNode(
        nodes,
        connection.source,
        connection.sourceHandle,
      );
      const edgeStyle = getEdgeStyle(sourcePortType);

      // Execution edges use "animated" style, data edges use "default"
      const isExecutionStyle = edgeStyle === "animated";
      const edgeType = isExecutionStyle ? "execution" : "data";

      // Auto-replace: remove existing edge on non-multiInput target
      const targetNode = nodes.find((n) => n.id === connection.target);
      let baseEdges = edges;
      if (
        targetNode &&
        connection.targetHandle &&
        !isPortMultiInput(targetNode.type ?? "", connection.targetHandle)
      ) {
        baseEdges = edges.filter(
          (e) =>
            !(
              e.target === connection.target &&
              e.targetHandle === connection.targetHandle
            ),
        );
      }

      const newEdge = assignEdgeOrder(nodes, baseEdges, {
        ...connection,
        type: edgeType,
        data: { edgeType, edgeStyle },
      });

      commit((state) => ({
        ...state,
        edges: normalizeMultiInputEdgeOrders(
          nodes,
          addEdge(newEdge, baseEdges),
        ),
        isDirty: true,
      }));
    },
    onReconnect: (oldEdge, newConnection) => {
      const { nodes, edges } = document.get();
      const reconnected = reconnectEdge(oldEdge, newConnection, edges);
      commit((state) => ({
        ...state,
        edges: normalizeMultiInputEdgeOrders(nodes, reconnected),
        isDirty: true,
      }));
    },
    addNode: (type, position, data = {}) => {
      const currentGroupId = actions.getCurrentGroupId();
      const newNode: Node = {
        id: generateId(),
        type,
        position,
        data: {
          ...data,
          ...(currentGroupId && { parentGroupId: currentGroupId }),
        },
      };
      commit((state) => ({
        ...state,
        nodes: [...document.get().nodes, newNode],
        isDirty: true,
      }));
      return newNode.id;
    },
    updateNodeData: (nodeId, data) => {
      commit(
        (state) => ({
          ...state,
          nodes: document
            .get()
            .nodes.map((node) =>
              node.id === nodeId
                ? { ...node, data: { ...node.data, ...data } }
                : node,
            ),
          isDirty: true,
        }),
        `${nodeId}:${Object.keys(data).toSorted().join(",")}`,
      );
    },
    deleteSelected: () => {
      const { nodes, edges } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      const { nodes: nodesToDelete } = selectedSubgraph(
        nodes,
        edges,
        currentGroupId,
      );
      const nodeIdsToDelete = new Set(nodesToDelete.map((n) => n.id));
      const visibleIds = new Set(
        nodes
          .filter(
            (node) => (node.data["parentGroupId"] ?? null) === currentGroupId,
          )
          .map((node) => node.id),
      );

      commit((state) => ({
        ...state,
        nodes: nodes.filter((node) => !nodeIdsToDelete.has(node.id)),
        edges: normalizeMultiInputEdgeOrders(
          nodes,
          edges.filter(
            (edge) =>
              !(
                edge.selected &&
                visibleIds.has(edge.source) &&
                visibleIds.has(edge.target)
              ) &&
              !nodeIdsToDelete.has(edge.source) &&
              !nodeIdsToDelete.has(edge.target),
          ),
        ),
        isDirty: true,
      }));
    },
    disconnectNode: (nodeId) => {
      const { edges, nodes } = document.get();
      commit((state) => ({
        ...state,
        edges: normalizeMultiInputEdgeOrders(
          nodes,
          edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
          ),
        ),
        isDirty: true,
      }));
    },
    setSelectedNode: (nodeId) => {
      ui.setState((state) => ({ ...state, selectedNodeId: nodeId }));
    },
    reorderMultiInputEdges: (targetNodeId, targetHandleId, orderedEdgeIds) => {
      const { nodes, edges } = document.get();
      const orderLookup = new Map(
        orderedEdgeIds.map((edgeId, index) => [edgeId, index]),
      );
      const reorderedEdges = edges.map((edge) => {
        if (
          edge.target !== targetNodeId ||
          edge.targetHandle !== targetHandleId
        ) {
          return edge;
        }

        const nextOrder = orderLookup.get(edge.id);
        if (nextOrder === undefined) {
          return edge;
        }

        return {
          ...edge,
          data: {
            ...edge.data,
            order: nextOrder,
          },
        };
      });

      commit((state) => ({
        ...state,
        edges: normalizeMultiInputEdgeOrders(nodes, reorderedEdges),
        isDirty: true,
      }));
    },
    toggleMute: (nodeId) => {
      commit((state) => ({
        ...state,
        nodes: document
          .get()
          .nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, muted: !node.data["muted"] } }
              : node,
          ),
        isDirty: true,
      }));
    },
    toggleCollapse: (nodeId) => {
      commit((state) => ({
        ...state,
        nodes: document.get().nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, collapsed: !node.data["collapsed"] },
              }
            : node,
        ),
        isDirty: true,
      }));
    },
    toggleSocketVisibility: (nodeId) => {
      const { nodes } = document.get();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // Current hidden sockets
      const currentHidden = nodeDataStrings(node.data, "hiddenSockets") ?? [];

      // Toggle: if any hidden, show all; otherwise we'll hide unconnected
      // Note: We can't know all sockets here without the definition,
      // so we just toggle the hiddenSockets flag
      const newHidden =
        currentHidden.length > 0 ? [] : ["__hide_unconnected__"];

      commit((state) => ({
        ...state,
        nodes: nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, hiddenSockets: newHidden } }
            : n,
        ),
        isDirty: true,
      }));
    },
    togglePreview: (nodeId) => {
      const current = ui.get().previewEnabledNodes;
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      ui.setState((state) => ({ ...state, previewEnabledNodes: next }));
    },
    observesNodeOutputs: (nodeId) => {
      if (ui.get().previewEnabledNodes.has(nodeId)) return true;
      const prefix = outputKey(nodeId, "");
      for (const key of derived.debugOutputs.get().keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    },
    recordNodeOutputs: (nodeId, outputs) => {
      // The server skips layout nodes, so debug nodes show the output that
      // reaches them through reroutes, other debug nodes, and groups.
      const sources = derived.debugOutputs.get();
      const debugValues = Object.entries(outputs).flatMap(([port, value]) =>
        (sources.get(outputKey(nodeId, port)) ?? []).map((debugId) => ({
          debugId,
          value,
        })),
      );
      const timestamp = new Date();
      execution.setState((state) => {
        const previewValues = new Map([
          ...state.previewValues,
          [nodeId, outputs],
        ]);
        if (debugValues.length === 0) return { ...state, previewValues };
        const debugNodeValues = new Map(state.debugNodeValues);
        for (const { debugId, value } of debugValues) {
          const previous = debugNodeValues.get(debugId) ?? [];
          debugNodeValues.set(debugId, [
            ...previous.slice(-49),
            { id: crypto.randomUUID(), value, timestamp },
          ]);
        }
        return { ...state, previewValues, debugNodeValues };
      });
    },
    createFrame: (nodeIds, label) => {
      if (nodeIds.length === 0) return;

      const { nodes } = document.get();
      const selectedNodes = nodes.filter((n) => nodeIds.includes(n.id));
      if (selectedNodes.length === 0) return;

      // Calculate bounding box of selected nodes
      const padding = 40;
      const minX =
        Math.min(...selectedNodes.map((n) => n.position.x)) - padding;
      const minY =
        Math.min(...selectedNodes.map((n) => n.position.y)) - padding;
      const maxX =
        Math.max(
          ...selectedNodes.map(
            (n) => n.position.x + (n.measured?.width ?? 160),
          ),
        ) + padding;
      const maxY =
        Math.max(
          ...selectedNodes.map(
            (n) => n.position.y + (n.measured?.height ?? 100),
          ),
        ) + padding;

      const frameId = generateId();
      const currentGroupId = actions.getCurrentGroupId();
      const frameNode: Node = {
        id: frameId,
        type: "layout.frame",
        position: { x: minX, y: minY },
        data: {
          // Without a label, the frame shows its name in the viewer's language.
          ...(label !== undefined && { label }),
          containedNodes: nodeIds,
          ...(currentGroupId && { parentGroupId: currentGroupId }),
        },
        width: maxX - minX,
        height: maxY - minY,
        // Frames should be behind other nodes
        zIndex: -1,
      };

      // Update contained nodes to reference the frame
      const updatedNodes = nodes.map((node) =>
        nodeIds.includes(node.id)
          ? { ...node, data: { ...node.data, parentFrameId: frameId } }
          : node,
      );

      commit((state) => ({
        ...state,
        nodes: [frameNode, ...updatedNodes],
        isDirty: true,
      }));
    },
    insertReroute: (edgeId, position) => {
      const { edges, nodes } = document.get();
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const rerouteId = generateId();
      const currentGroupId = actions.getCurrentGroupId();
      const rerouteNode: Node = {
        id: rerouteId,
        type: "layout.reroute",
        position,
        data: {
          ...(currentGroupId && { parentGroupId: currentGroupId }),
        },
      };

      // Get the port type from node definition
      const sourceType = getPortTypeForNode(
        nodes,
        edge.source,
        edge.sourceHandle,
      );

      // Create new edges with simple port IDs
      const newEdge1: Edge = {
        id: generateId(),
        source: edge.source,
        target: rerouteId,
        targetHandle: "in",
        type: edge.type,
        ...optionalEdgeFields({
          sourceHandle: edge.sourceHandle,
          data: edge.data,
        }),
      };

      const newEdge2: Edge = {
        id: generateId(),
        source: rerouteId,
        sourceHandle: "out",
        target: edge.target,
        type: edge.type,
        ...optionalEdgeFields({
          targetHandle: edge.targetHandle,
          data: edge.data,
        }),
      };

      commit((state) => ({
        ...state,
        nodes: [
          ...nodes,
          {
            ...rerouteNode,
            data: { ...rerouteNode.data, resolvedType: sourceType },
          },
        ],
        edges: [...edges.filter((e) => e.id !== edgeId), newEdge1, newEdge2],
        isDirty: true,
      }));
    },
    duplicateSelected: () => {
      const { nodes, edges } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      const selected = selectedSubgraph(nodes, edges, currentGroupId);
      if (selected.nodes.length === 0) return;
      const { nodes: newNodes, edges: newEdges } = cloneSubgraph(
        selected,
        currentGroupId,
        { x: 50, y: 50 },
      );

      // Deselect original nodes
      const updatedNodes = nodes.map((n) =>
        n.selected ? { ...n, selected: false } : n,
      );

      commit((state) => ({
        ...state,
        nodes: [...updatedNodes, ...newNodes],
        edges: [...edges, ...newEdges],
        isDirty: true,
      }));
    },
    enterGroup: (groupNodeId) => {
      const node = document.get().nodes.find((n) => n.id === groupNodeId);
      if (node?.type !== "layout.group") return;

      ui.setState((state) => ({
        ...state,
        groupEditStack: [...ui.get().groupEditStack, groupNodeId],
        selectedNodeId: null,
      }));
    },
    exitGroup: () => {
      const stack = ui.get().groupEditStack;
      if (stack.length === 0) return;

      ui.setState((state) => ({
        ...state,
        groupEditStack: stack.slice(0, -1),
        selectedNodeId: null,
      }));
    },
    exitToRoot: () => {
      ui.setState((state) => ({
        ...state,
        groupEditStack: [],
        selectedNodeId: null,
      }));
    },
    revealNode: (nodeId) => {
      const { nodes } = document.get();
      const byId = new Map(nodes.map((node) => [node.id, node]));
      if (!byId.has(nodeId)) return false;
      const groupPath: string[] = [];
      let parent = nodeDataString(byId.get(nodeId)?.data, "parentGroupId");
      while (parent && byId.has(parent) && !groupPath.includes(parent)) {
        groupPath.unshift(parent);
        parent = nodeDataString(byId.get(parent)?.data, "parentGroupId");
      }
      batch(() => {
        ui.setState((state) => ({
          ...state,
          groupEditStack: groupPath,
          selectedNodeId: nodeId,
        }));
        document.setState((state) => ({
          ...state,
          nodes: state.nodes.map((node) =>
            (node.id === nodeId) === !!node.selected
              ? node
              : { ...node, selected: node.id === nodeId },
          ),
        }));
      });
      return true;
    },
    getCurrentGroupId: () => {
      const stack = ui.get().groupEditStack;
      return stack.at(-1) ?? null;
    },

    createGroupFromSelection: () => {
      const { nodes, edges } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Get selected nodes in current view. The enclosing group's interface
      // nodes must stay on its canvas.
      const selectedNodes = nodes.filter((n) => {
        if (!n.selected || isGroupInterfaceNode(n)) return false;
        const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
        return nodeGroupId === currentGroupId;
      });

      if (selectedNodes.length === 0) return;

      const selectedIds = new Set(selectedNodes.map((n) => n.id));

      // Find edges that cross the selection boundary
      const incomingEdges = edges.filter(
        (e) => !selectedIds.has(e.source) && selectedIds.has(e.target),
      );
      const outgoingEdges = edges.filter(
        (e) => selectedIds.has(e.source) && !selectedIds.has(e.target),
      );
      // Internal edges (between selected nodes) are automatically preserved
      // since we only remove incoming/outgoing crossing edges

      // Create group input/output sockets based on crossing edges
      // Port IDs are now simple names, so use them directly as labels
      const groupInputs = incomingEdges.map((e, i) => ({
        id: `group-in-${i}`,
        type: getPortTypeForNode(nodes, e.source, e.sourceHandle),
        label: e.targetHandle || `Input ${i + 1}`,
        originalTarget: e.target,
        originalTargetHandle: e.targetHandle,
        edge: e,
      }));

      const groupOutputs = outgoingEdges.map((e, i) => ({
        id: `group-out-${i}`,
        type: getPortTypeForNode(nodes, e.source, e.sourceHandle),
        label: e.sourceHandle || `Output ${i + 1}`,
        originalSource: e.source,
        originalSourceHandle: e.sourceHandle,
        edge: e,
      }));

      // Calculate group position (center of selected nodes)
      const centerX =
        selectedNodes.reduce((sum, n) => sum + n.position.x, 0) /
        selectedNodes.length;
      const centerY =
        selectedNodes.reduce((sum, n) => sum + n.position.y, 0) /
        selectedNodes.length;

      const groupId = generateId();

      // Create group node
      const groupNode: Node = {
        id: groupId,
        type: "layout.group",
        position: { x: centerX - 80, y: centerY - 40 },
        data: {
          inputs: groupInputs.map((i) => ({
            id: i.id,
            type: i.type,
            label: i.label,
          })),
          outputs: groupOutputs.map((o) => ({
            id: o.id,
            type: o.type,
            label: o.label,
          })),
          ...(currentGroupId && { parentGroupId: currentGroupId }),
        },
      };

      // Keep interfaces outside the contents, including wide or spread-out nodes.
      const contentLeft = Math.min(...selectedNodes.map((n) => n.position.x));
      const contentRight = Math.max(
        ...selectedNodes.map(
          (n) =>
            n.position.x +
            (n.measured?.width ?? n.width ?? n.initialWidth ?? 160),
        ),
      );
      const contentTop = Math.min(...selectedNodes.map((n) => n.position.y));
      const interfaceGap = 80;

      // Create GroupInput and GroupOutput nodes inside the group
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
        data: {
          parentGroupId: groupId,
          outputs: groupInputs.map((i) => ({
            id: i.id,
            type: i.type,
            label: i.label,
          })),
        },
      };

      const groupOutputNode: Node = {
        id: generateId(),
        type: "layout.group_output",
        position: {
          x: contentRight - groupNode.position.x + interfaceGap,
          y: contentTop - groupNode.position.y,
        },
        data: {
          parentGroupId: groupId,
          inputs: groupOutputs.map((o) => ({
            id: o.id,
            type: o.type,
            label: o.label,
          })),
        },
      };

      // Update selected nodes to be inside group
      const updatedNodes = nodes.map((n) => {
        if (selectedIds.has(n.id)) {
          // Store positions relative to the group origin so ungrouping restores them.
          return {
            ...n,
            data: { ...n.data, parentGroupId: groupId },
            position: {
              x: n.position.x - groupNode.position.x,
              y: n.position.y - groupNode.position.y,
            },
            selected: false,
          };
        }
        return n;
      });

      // Create new edges:
      // 1. External edges now connect to group node
      // 2. Internal edges from GroupInput to original targets
      // 3. Internal edges from original sources to GroupOutput
      const newExternalEdges: Edge[] = [];
      const newInternalEdges: Edge[] = [];

      // Rewire incoming edges to group
      for (const input of groupInputs) {
        const e = input.edge;

        // External: source -> group
        newExternalEdges.push({
          ...e,
          id: generateId(),
          target: groupId,
          targetHandle: input.id,
        });

        // Internal: GroupInput -> original target
        newInternalEdges.push({
          id: generateId(),
          source: groupInputNode.id,
          sourceHandle: input.id,
          target: input.originalTarget,
          type: e.type,
          ...optionalEdgeFields({
            targetHandle: input.originalTargetHandle,
            data: e.data,
          }),
        });
      }

      // Rewire outgoing edges from group
      for (const output of groupOutputs) {
        const e = output.edge;

        // External: group -> target
        newExternalEdges.push({
          ...e,
          id: generateId(),
          source: groupId,
          sourceHandle: output.id,
        });

        // Internal: original source -> GroupOutput
        newInternalEdges.push({
          id: generateId(),
          source: output.originalSource,
          target: groupOutputNode.id,
          targetHandle: output.id,
          type: e.type,
          ...optionalEdgeFields({
            sourceHandle: output.originalSourceHandle,
            data: e.data,
          }),
        });
      }

      // Remove old crossing edges, keep internal edges
      const edgesToRemove = new Set([
        ...incomingEdges.map((e) => e.id),
        ...outgoingEdges.map((e) => e.id),
      ]);

      commit((state) => ({
        ...state,
        nodes: [...updatedNodes, groupNode, groupInputNode, groupOutputNode],
        edges: [
          ...edges.filter((e) => !edgesToRemove.has(e.id)),
          ...newExternalEdges,
          ...newInternalEdges,
        ],
        isDirty: true,
      }));
    },
    ungroupSelected: () => {
      const { nodes, edges } = document.get();
      const { selectedNodeId, groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      const groupNode = nodes.find(
        (n) => n.id === selectedNodeId && n.type === "layout.group",
      );
      if (!groupNode) return;

      const groupId = groupNode.id;

      // Find nodes inside this group
      const innerNodes = nodes.filter(
        (n) => n.data["parentGroupId"] === groupId,
      );

      // Find GroupInput and GroupOutput nodes
      const groupInputNode = innerNodes.find(
        (n) => n.type === "layout.group_input",
      );
      const groupOutputNode = innerNodes.find(
        (n) => n.type === "layout.group_output",
      );

      // Get position offset to move inner nodes back to parent level
      const offsetX = groupNode.position.x;
      const offsetY = groupNode.position.y;

      // Nodes to keep (inner nodes minus GroupInput/GroupOutput, with adjusted positions)
      const nodesFromGroup = innerNodes
        .filter(
          (n) =>
            n.type !== "layout.group_input" && n.type !== "layout.group_output",
        )
        .map((n) => ({
          ...n,
          data: {
            ...n.data,
            parentGroupId: currentGroupId ?? undefined,
          },
          position: {
            x: n.position.x + offsetX,
            y: n.position.y + offsetY,
          },
        }));

      // Find edges to/from group node and rewire them
      const edgesToGroup = edges.filter((e) => e.target === groupId);
      const edgesFromGroup = edges.filter((e) => e.source === groupId);

      let rewiredEdges = [...edges];

      for (const externalEdge of edgesToGroup) {
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
        (e) =>
          e.source !== groupInputNode?.id && e.target !== groupInputNode?.id,
      );

      for (const externalEdge of edgesFromGroup) {
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
      const nodesToRemove = new Set([
        groupId,
        ...innerNodes.filter((n) => isGroupInterfaceNode(n)).map((n) => n.id),
      ]);

      batch(() => {
        commit((state) => ({
          ...state,
          nodes: [
            ...nodes.filter(
              (n) =>
                !nodesToRemove.has(n.id) && n.data["parentGroupId"] !== groupId,
            ),
            ...nodesFromGroup,
          ],
          edges: rewiredEdges.filter(
            (e) => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target),
          ),
          isDirty: true,
        }));
        ui.setState((state) => ({ ...state, selectedNodeId: null }));
      });
    },
    undo: () => {
      const { past, future } = history.get();
      const entry = past.at(-1);
      if (!entry || gestureStart) return;
      const { nodes, edges } = document.get();
      lastCoalesce = null;
      history.setState(() => ({
        past: past.slice(0, -1),
        future: [...future, { nodes, edges }],
      }));
      restoreGraph(entry);
    },
    redo: () => {
      const { past, future } = history.get();
      const entry = future.at(-1);
      if (!entry || gestureStart) return;
      const { nodes, edges } = document.get();
      lastCoalesce = null;
      history.setState(() => ({
        past: [...past, { nodes, edges }],
        future: future.slice(0, -1),
      }));
      restoreGraph(entry);
    },
    beginHistoryGesture: () => {
      if (gestureStart) return;
      const { nodes, edges } = document.get();
      gestureStart = { nodes, edges };
    },
    endHistoryGesture: () => {
      const start = gestureStart;
      if (!start) return;
      gestureStart = null;
      const current = actions.getScriptData();
      if (
        !sameScriptDocument(current, {
          ...current,
          nodes: start.nodes,
          edges: start.edges,
        })
      )
        remember(start);
    },
    findClosestEdge: (position, threshold, drawn) => {
      const { nodes, edges } = currentCanvas();
      return findClosestEdgeToPoint(nodes, edges, position, threshold, drawn);
    },
    insertNodeOnEdge: (nodeId, edgeId) => {
      const { nodes, edges } = document.get();
      const edge = edges.find((e) => e.id === edgeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (!edge || !node) return;

      // Get port types from the edge's source/target
      const sourceType = getPortTypeForNode(
        nodes,
        edge.source,
        edge.sourceHandle,
      );
      const targetType = getPortTypeForNode(
        nodes,
        edge.target,
        edge.targetHandle,
      );
      const isExecutionEdge = sourceType === "execution";

      // Look up ports from the node definition
      const definition = getNodeDefinition(node.type ?? "");
      const defInputs = definition?.inputs ?? [];
      const defOutputs = definition?.outputs ?? [];

      // Find compatible input port on the new node
      let inputHandle: string | undefined;
      if (isExecutionEdge) {
        inputHandle = defInputs.find((p) => p.type === "execution")?.id;
      } else {
        inputHandle = defInputs.find(
          (p) =>
            p.type !== "execution" &&
            isTypeCompatible(sourceType, p.type as PortType),
        )?.id;
      }

      // Find compatible output port on the new node
      let outputHandle: string | undefined;
      if (isExecutionEdge) {
        outputHandle = defOutputs.find((p) => p.type === "execution")?.id;
      } else {
        outputHandle = defOutputs.find(
          (p) =>
            p.type !== "execution" &&
            isTypeCompatible(p.type as PortType, targetType),
        )?.id;
      }

      // Fallback for layout nodes (reroute, group) without definitions
      if (!inputHandle) inputHandle = "in";
      if (!outputHandle) outputHandle = "out";

      // If definition exists but no compatible ports found, bail out
      if (
        definition &&
        (!defInputs.some((p) => p.id === inputHandle) ||
          !defOutputs.some((p) => p.id === outputHandle))
      ) {
        return;
      }

      // Create new edges
      const newEdge1: Edge = {
        id: generateId(),
        source: edge.source,
        target: nodeId,
        targetHandle: inputHandle,
        type: edge.type,
        ...optionalEdgeFields({
          sourceHandle: edge.sourceHandle,
          data: edge.data,
        }),
      };

      const newEdge2: Edge = {
        id: generateId(),
        source: nodeId,
        sourceHandle: outputHandle,
        target: edge.target,
        type: edge.type,
        ...optionalEdgeFields({
          targetHandle: edge.targetHandle,
          data: edge.data,
        }),
      };

      commit((state) => ({
        ...state,
        edges: [...edges.filter((e) => e.id !== edgeId), newEdge1, newEdge2],
        isDirty: true,
      }));
    },
    clearDebugValues: (nodeId) => {
      const current = execution.get().debugNodeValues;
      const next = new Map(current);
      next.delete(nodeId);
      execution.setState((state) => ({ ...state, debugNodeValues: next }));
    },

    selectAll: () => {
      const { nodes } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Select all nodes in current view
      document.setState((state) => ({
        ...state,
        nodes: nodes.map((n) => {
          const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
          if (nodeGroupId !== currentGroupId) return n;
          return { ...n, selected: true };
        }),
      }));
    },
    deselectAll: () => {
      const { nodes } = document.get();
      document.setState((state) => ({
        ...state,
        nodes: nodes.map((n) => ({ ...n, selected: false })),
      }));
    },
    selectShortestPath: (fromNodeId, toNodeId) => {
      const { nodes, edges } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Build undirected adjacency list (treat edges as bidirectional for path finding)
      const adjacency = new Map<string, string[]>();
      for (const edge of edges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
        adjacency.get(edge.source)?.push(edge.target);
        adjacency.get(edge.target)?.push(edge.source);
      }

      // BFS to find shortest path
      const visited = new Set<string>();
      const parent = new Map<string, string>();
      const queue: string[] = [fromNodeId];
      visited.add(fromNodeId);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        if (current === toNodeId) break;

        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            parent.set(neighbor, current);
            queue.push(neighbor);
          }
        }
      }

      // Reconstruct path
      const pathNodes = new Set<string>();
      if (visited.has(toNodeId)) {
        let current: string | undefined = toNodeId;
        while (current) {
          pathNodes.add(current);
          current = parent.get(current);
        }
      }

      // If no path found, just select both nodes
      if (pathNodes.size === 0) {
        pathNodes.add(fromNodeId);
        pathNodes.add(toNodeId);
      }

      // Update selection (add path nodes to current selection)
      document.setState((state) => ({
        ...state,
        nodes: nodes.map((n) => {
          const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
          if (nodeGroupId !== currentGroupId) return n;
          if (pathNodes.has(n.id)) return { ...n, selected: true };
          return n;
        }),
      }));
    },
    selectLinked: (direction) => {
      const { nodes, edges } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Get currently selected nodes in current view
      const selectedNodes = nodes.filter((n) => {
        if (!n.selected) return false;
        const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
        return nodeGroupId === currentGroupId;
      });

      if (selectedNodes.length === 0) return;

      const selectedIds = new Set(selectedNodes.map((n) => n.id));
      const toSelect = new Set(selectedIds);

      // Build adjacency lists
      const upstream = new Map<string, string[]>();
      const downstream = new Map<string, string[]>();
      for (const edge of edges) {
        if (!downstream.has(edge.source)) downstream.set(edge.source, []);
        downstream.get(edge.source)?.push(edge.target);
        if (!upstream.has(edge.target)) upstream.set(edge.target, []);
        upstream.get(edge.target)?.push(edge.source);
      }

      // BFS traversal
      const queue = [...selectedIds];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        if (direction === "upstream" || direction === "both") {
          for (const source of upstream.get(current) ?? []) {
            if (!toSelect.has(source)) {
              toSelect.add(source);
              queue.push(source);
            }
          }
        }

        if (direction === "downstream" || direction === "both") {
          for (const target of downstream.get(current) ?? []) {
            if (!toSelect.has(target)) {
              toSelect.add(target);
              queue.push(target);
            }
          }
        }
      }

      // Update selection (only nodes in current view)
      document.setState((state) => ({
        ...state,
        nodes: nodes.map((n) => {
          const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
          if (nodeGroupId !== currentGroupId) return n;
          return { ...n, selected: toSelect.has(n.id) };
        }),
      }));
    },
    selectSimilar: () => {
      const { nodes } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Get types of selected nodes
      const selectedTypes = new Set(
        nodes
          .filter((n) => {
            if (!n.selected) return false;
            const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
            return nodeGroupId === currentGroupId;
          })
          .map((n) => n.type),
      );

      if (selectedTypes.size === 0) return;

      // Select all nodes of the same types in current view
      document.setState((state) => ({
        ...state,
        nodes: nodes.map((n) => {
          const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
          if (nodeGroupId !== currentGroupId) return n;
          return { ...n, selected: selectedTypes.has(n.type) };
        }),
      }));
    },
    getSelectedForClipboard: () => {
      const { nodes, edges, scriptId } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      const selected = selectedSubgraph(nodes, edges, currentGroupId);
      if (selected.nodes.length === 0) return null;

      return {
        ...selected,
        sourceScriptId: scriptId,
      };
    },
    pasteClipboardData: (pasted, position) => {
      const { nodes, edges } = document.get();
      const { groupEditStack } = ui.get();

      // A group input or output node only works inside its own group, which
      // already has one. Older clients could copy them on their own.
      const looseInterfaces = new Set(
        subgraphRoots(pasted.nodes)
          .filter((node) => isGroupInterfaceNode(node))
          .map((node) => node.id),
      );
      const clipboardData = {
        nodes: pasted.nodes.filter((node) => !looseInterfaces.has(node.id)),
        edges: pasted.edges.filter(
          (edge) =>
            !looseInterfaces.has(edge.source) &&
            !looseInterfaces.has(edge.target),
        ),
      };
      if (clipboardData.nodes.length === 0) return;

      const currentGroupId = groupEditStack.at(-1) ?? null;

      const roots = subgraphRoots(clipboardData.nodes);
      if (roots.length === 0) return;

      // Child positions belong to separate group canvases, not the paste target.
      const centerX =
        roots.reduce((sum, n) => sum + n.position.x, 0) / roots.length;
      const centerY =
        roots.reduce((sum, n) => sum + n.position.y, 0) / roots.length;
      const { nodes: newNodes, edges: newEdges } = cloneSubgraph(
        clipboardData,
        currentGroupId,
        { x: position.x - centerX, y: position.y - centerY },
      );

      // Deselect existing nodes
      const updatedNodes = nodes.map((n) =>
        n.selected ? { ...n, selected: false } : n,
      );

      commit((state) => ({
        ...state,
        nodes: [...updatedNodes, ...newNodes],
        edges: [...edges, ...newEdges],
        isDirty: true,
      }));
    },
    alignNodes: (direction) => {
      const { nodes } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Get selected nodes in current view
      const selectedNodes = nodes.filter((n) => {
        if (!n.selected) return false;
        const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
        return nodeGroupId === currentGroupId;
      });

      if (selectedNodes.length < 2) return;

      const selectedIds = new Set(selectedNodes.map((n) => n.id));

      // Calculate reference values
      const positions = selectedNodes.map((n) => ({
        x: n.position.x,
        y: n.position.y,
        width: n.measured?.width ?? 160,
        height: n.measured?.height ?? 100,
      }));

      let targetValue: number;
      switch (direction) {
        case "left": {
          targetValue = Math.min(...positions.map((p) => p.x));
          break;
        }
        case "right": {
          targetValue = Math.max(...positions.map((p) => p.x + p.width));
          break;
        }
        case "top": {
          targetValue = Math.min(...positions.map((p) => p.y));
          break;
        }
        case "bottom": {
          targetValue = Math.max(...positions.map((p) => p.y + p.height));
          break;
        }
        case "centerH": {
          targetValue =
            positions.reduce((sum, p) => sum + p.x + p.width / 2, 0) /
            positions.length;
          break;
        }
        case "centerV": {
          targetValue =
            positions.reduce((sum, p) => sum + p.y + p.height / 2, 0) /
            positions.length;
          break;
        }
      }

      commit((state) => ({
        ...state,
        nodes: nodes.map((n) => {
          if (!selectedIds.has(n.id)) return n;

          const width = n.measured?.width ?? 160;
          const height = n.measured?.height ?? 100;

          const newPosition = { ...n.position };
          switch (direction) {
            case "left": {
              newPosition.x = targetValue;
              break;
            }
            case "right": {
              newPosition.x = targetValue - width;
              break;
            }
            case "top": {
              newPosition.y = targetValue;
              break;
            }
            case "bottom": {
              newPosition.y = targetValue - height;
              break;
            }
            case "centerH": {
              newPosition.x = targetValue - width / 2;
              break;
            }
            case "centerV": {
              newPosition.y = targetValue - height / 2;
              break;
            }
          }

          return { ...n, position: newPosition };
        }),
        isDirty: true,
      }));
    },
    distributeNodes: (direction) => {
      const { nodes } = document.get();
      const { groupEditStack } = ui.get();
      const currentGroupId = groupEditStack.at(-1) ?? null;

      // Get selected nodes in current view
      const selectedNodes = nodes.filter((n) => {
        if (!n.selected) return false;
        const nodeGroupId = nodeDataString(n.data, "parentGroupId") ?? null;
        return nodeGroupId === currentGroupId;
      });

      if (selectedNodes.length < 3) return;

      const selectedIds = new Set(selectedNodes.map((n) => n.id));

      // Sort by position
      const sorted = [...selectedNodes].toSorted((a, b) =>
        direction === "horizontal"
          ? a.position.x - b.position.x
          : a.position.y - b.position.y,
      );

      // Calculate spacing
      const first = sorted[0];
      const last = sorted.at(-1);
      if (first === undefined || last === undefined) return;
      const lastPos =
        direction === "horizontal" ? last.position.x : last.position.y;
      const firstPos =
        direction === "horizontal" ? first.position.x : first.position.y;

      const totalSpace = lastPos - firstPos;
      const step = totalSpace / (sorted.length - 1);

      // Create position map
      const positionMap = new Map<string, number>();
      for (const [i, node] of sorted.entries()) {
        positionMap.set(node.id, firstPos + i * step);
      }

      commit((state) => ({
        ...state,
        nodes: nodes.map((n) => {
          if (!selectedIds.has(n.id)) return n;

          const newPos = positionMap.get(n.id);
          if (newPos === undefined) return n;

          return {
            ...n,
            position:
              direction === "horizontal"
                ? { ...n.position, x: newPos }
                : { ...n.position, y: newPos },
          };
        }),
        isDirty: true,
      }));
    },
    openQuickAddMenu: (position, screenPosition, sourceSocket) => {
      ui.setState((state) => ({
        ...state,
        quickAddMenu: {
          position,
          screenPosition,
          sourceSocket,
        },
      }));
    },
    closeQuickAddMenu: () => {
      ui.setState((state) => ({ ...state, quickAddMenu: null }));
    },
    startLinkCutting: (point) => {
      ui.setState((state) => ({
        ...state,
        linkCutting: {
          active: true,
          startPoint: point,
          endPoint: point,
        },
      }));
    },
    updateLinkCutting: (point) => {
      const { linkCutting } = ui.get();
      if (linkCutting.active) {
        ui.setState((state) => ({
          ...state,
          linkCutting: {
            ...linkCutting,
            endPoint: point,
          },
        }));
      }
    },
    endLinkCutting: (drawn) => {
      const { linkCutting } = ui.get();
      if (
        linkCutting.active &&
        linkCutting.startPoint &&
        linkCutting.endPoint
      ) {
        // Cut edges that intersect the line
        actions.cutEdgesIntersectingLine(
          linkCutting.startPoint,
          linkCutting.endPoint,
          drawn,
        );
      }
      actions.cancelLinkCutting();
    },
    cancelLinkCutting: () => {
      if (!ui.get().linkCutting.active) return;
      ui.setState((state) => ({
        ...state,
        linkCutting: {
          active: false,
          startPoint: null,
          endPoint: null,
        },
      }));
    },
    cutEdgesIntersectingLine: (start, end, drawn) => {
      const { edges } = document.get();
      // Only cut wires drawn on this canvas. Other groups use other positions.
      const canvas = currentCanvas();
      const shapes = edgeShapes(canvas.nodes, canvas.edges, drawn);
      const edgesToRemove = canvas.edges.filter((edge) => {
        const shape = shapes.get(edge.id);
        return shape !== undefined && polylineCrossesSegment(shape, start, end);
      });

      if (edgesToRemove.length > 0) {
        const removed = new Set(edgesToRemove.map((edge) => edge.id));
        commit((state) => ({
          ...state,
          edges: normalizeMultiInputEdgeOrders(
            document.get().nodes,
            edges.filter((edge) => !removed.has(edge.id)),
          ),
          isDirty: true,
        }));
      }
    },
    setScriptName: (name) => {
      document.setState((state) => ({
        ...state,
        scriptName: name,
        isDirty: true,
      }));
    },
    setScriptDescription: (description) => {
      document.setState((state) => ({
        ...state,
        scriptDescription: description,
        isDirty: true,
      }));
    },
    setPaused: (paused) => {
      document.setState((state) => ({ ...state, paused, isDirty: true }));
    },
    setSavedPaused: (paused) => {
      document.setState((state) => ({
        ...state,
        paused,
        lastSavedPaused: paused,
      }));
    },
    syncScriptStatus: (status, preserveActiveNode = false) => {
      if (document.get().scriptId !== status.scriptId) return;
      batch(() => {
        if (status.paused !== undefined) {
          const paused = status.paused;
          document.setState((state) =>
            state.lastSavedPaused === paused
              ? state
              : {
                  ...state,
                  paused:
                    state.paused === state.lastSavedPaused
                      ? paused
                      : state.paused,
                  lastSavedPaused: paused,
                },
          );
        }
        execution.setState((state) => ({
          ...state,
          isActive: status.isActive,
          activeNodeId: status.isActive
            ? preserveActiveNode
              ? state.activeNodeId
              : (status.activeNodeId ?? null)
            : null,
          activeNodeExecutions:
            status.isActive && preserveActiveNode
              ? state.activeNodeExecutions
              : new Map<bigint, string>(),
        }));
      });
    },
    setQuotas: (quotas) => {
      document.setState((state) => ({ ...state, quotas, isDirty: true }));
    },
    setActive: (active) => {
      execution.setState((state) => ({ ...state, isActive: active }));
    },
    setActiveNode: (nodeId) => {
      execution.setState((state) => ({
        ...state,
        activeNodeId: nodeId,
        activeNodeExecutions: new Map(),
      }));
    },
    startNode: (nodeId, executionId) => {
      execution.setState((state) => {
        if (!executionId) return { ...state, activeNodeId: nodeId };
        if (state.activeNodeExecutions.has(executionId)) return state;
        const activeNodeExecutions = new Map([
          ...state.activeNodeExecutions,
          [executionId, nodeId],
        ]);
        return { ...state, activeNodeId: nodeId, activeNodeExecutions };
      });
    },
    completeNode: (nodeId, executionId) => {
      execution.setState((state) => {
        if (!executionId) {
          return state.activeNodeExecutions.size === 0 &&
            state.activeNodeId === nodeId
            ? { ...state, activeNodeId: null }
            : state;
        }
        if (state.activeNodeExecutions.get(executionId) !== nodeId)
          return state;
        const activeNodeExecutions = new Map(state.activeNodeExecutions);
        activeNodeExecutions.delete(executionId);
        return {
          ...state,
          activeNodeExecutions,
          activeNodeId: Array.from(activeNodeExecutions.values()).pop() ?? null,
        };
      });
    },
    addExecutionLog: (log) => {
      execution.setState((state) => ({
        ...state,
        executionLogs: [...state.executionLogs, log].slice(-500),
      }));
    },
    addExecutionLogs: (logs) => {
      execution.setState((state) => {
        const executionLogs = mergeExecutionLogs(state.executionLogs, logs);
        return executionLogs === state.executionLogs
          ? state
          : { ...state, executionLogs };
      });
    },
    clearExecutionLogs: () => {
      execution.setState((state) => ({ ...state, executionLogs: [] }));
    },
    syncScriptDocument: (data) => {
      const current = document.get();
      if (
        current.scriptId !== data.id ||
        (!current.isDirty && !sameScriptDocument(actions.getScriptData(), data))
      ) {
        actions.loadScript(data);
      }
    },
    loadScript: (data) => {
      const edges = normalizeMultiInputEdgeOrders(data.nodes, data.edges);
      savedDocument = { ...data, edges };
      batch(() => {
        clearHistory();
        document.setState((state) => ({
          ...state,
          scriptId: data.id,
          scriptName: data.name,
          scriptDescription: data.description,
          paused: data.paused,
          lastSavedPaused: data.paused,
          quotas: data.quotas,
          nodes: data.nodes,
          edges,
          isDirty: false,
          lastSavedNodes: data.nodes,
          lastSavedEdges: edges,
        }));
        ui.setState((state) => ({
          ...state,
          selectedNodeId: null,
          groupEditStack: [],
          canvasRevision: state.canvasRevision + 1,
          previewEnabledNodes: new Set<string>(),
        }));
        execution.setState((state) => ({
          ...state,
          previewValues: new Map<string, Record<string, unknown>>(),
          debugNodeValues: new Map<string, DebugValue[]>(),
        }));
      });
    },
    loadScriptData: (data) => {
      const current = document.get();
      batch(() => {
        commit((state) => ({
          ...state,
          nodes: data.nodes,
          edges: normalizeMultiInputEdgeOrders(data.nodes, data.edges),
          scriptName: data.name ?? current.scriptName,
          scriptDescription: data.description ?? current.scriptDescription,
          paused: data.paused ?? current.paused,
          quotas: data.quotas,
          isDirty: true,
        }));
        ui.setState((state) => ({
          ...state,
          selectedNodeId: null,
          groupEditStack: [],
          canvasRevision: state.canvasRevision + 1,
          previewEnabledNodes: new Set<string>(),
        }));
        execution.setState((state) => ({
          ...state,
          previewValues: new Map<string, Record<string, unknown>>(),
          debugNodeValues: new Map<string, DebugValue[]>(),
        }));
      });
    },
    resetEditor: () => {
      savedDocument = emptyDocument();
      batch(() => {
        clearHistory();
        document.setState((state) => ({
          ...state,
          nodes: [],
          edges: [],
          scriptId: null,
          scriptName: UNTITLED_SCRIPT_NAME,
          scriptDescription: "",
          paused: true,
          lastSavedPaused: true,
          quotas: undefined,
          isDirty: false,
          lastSavedNodes: null,
          lastSavedEdges: null,
        }));
        execution.setState((state) => ({
          ...state,
          isActive: false,
          activeNodeId: null,
          activeNodeExecutions: new Map(),
          executionLogs: [],
          previewValues: new Map<string, Record<string, unknown>>(),
          debugNodeValues: new Map<string, DebugValue[]>(),
          nodeExecutionTimes: new Map<string, number[]>(),
        }));
        ui.setState((state) => ({
          ...state,
          selectedNodeId: null,
          quickAddMenu: null,
          groupEditStack: [],
          canvasRevision: state.canvasRevision + 1,
          previewEnabledNodes: new Set<string>(),

          linkCutting: {
            active: false,
            startPoint: null,
            endPoint: null,
          },
        }));
        validation.setState((state) => ({
          ...state,
          validationDiagnostics: [],
          diagnosticsByNode: new Map(),
        }));
      });
    },
    getScriptData: () => ({
      nodes: document.get().nodes,
      edges: document.get().edges,
      name: document.get().scriptName,
      description: document.get().scriptDescription,
      paused: document.get().paused,
      quotas: document.get().quotas,
    }),
    setValidationDiagnostics: (diagnostics) => {
      validation.setState((state) => ({
        ...state,
        validationDiagnostics: diagnostics,
        diagnosticsByNode: indexDiagnostics(
          diagnostics,
          state.diagnosticsByNode,
        ),
      }));
    },
    addNodeExecutionTime: (nodeId, timeMs) => {
      execution.setState((state) => {
        const times = new Map(state.nodeExecutionTimes);
        const existing = times.get(nodeId) ?? [];
        const updated = [...existing, timeMs].slice(-10);
        times.set(nodeId, updated);
        return { ...state, nodeExecutionTimes: times };
      });
    },
    markSaved: (data, scriptId, savedPaused = data.paused) => {
      savedDocument = data;
      document.setState((state) => {
        const paused =
          state.paused === data.paused ? savedPaused : state.paused;
        return {
          ...state,
          scriptId: scriptId ?? state.scriptId,
          paused,
          lastSavedPaused: savedPaused,
          lastSavedNodes: data.nodes,
          lastSavedEdges: data.edges,
          isDirty: !sameScriptDocument(
            { ...actions.getScriptData(), paused },
            { ...data, paused: savedPaused },
          ),
        };
      });
    },
  };
  return {
    document,
    ui,
    execution,
    validation,
    history,
    actions,
    ...derived,
  };
}
export type ScriptEditorSession = ReturnType<typeof createScriptEditorSession>;

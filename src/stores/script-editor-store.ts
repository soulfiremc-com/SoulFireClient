import { batch, createStore } from "@tanstack/store";
import { applyEdgeChanges, applyNodeChanges, type Node } from "@xyflow/react";
import { mergeExecutionLogs } from "@/lib/script-logs";
import { sameScriptDocument } from "@/lib/script-document";
import { outputKey } from "@/lib/script-debug-sources";
import { edgeShapes, polylineCrossesSegment } from "@/lib/script-edge-geometry";
import {
  alignSelection,
  canvasGraph,
  canvasSelection,
  connectEdge,
  createFrame,
  distributeSelection,
  findClosestEdge,
  groupSelection,
  insertNodeOnEdge,
  insertReroute,
  linkedNodes,
  normalizeEdgeOrders,
  normalizeScriptGraph,
  reconnectEdge,
  selectOnCanvas,
  shortestPath,
  ungroup,
  type ScriptGraph,
} from "@/lib/script-graph-ops";
import {
  cloneSubgraph,
  isGroupInterfaceNode,
  parentGroupOf,
  selectedSubgraph,
  subgraphRoots,
  withParentGroup,
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
import { nodeDataStrings } from "@/lib/script-node-data";

const HISTORY_LIMIT = 100;
const sameItems = <T>(first: readonly T[], second: readonly T[]) =>
  first === second ||
  (first.length === second.length &&
    first.every((item, index) => item === second[index]));
const HISTORY_COALESCE_MS = 1500;

const generateId = () => crypto.randomUUID();

// An empty name means untitled. The UI shows and saves it in the user's language.
const UNTITLED_SCRIPT_NAME = "";

type SavedMetadata = Pick<
  ScriptDocumentData,
  "name" | "description" | "quotas"
>;
const emptyMetadata = (): SavedMetadata => ({
  name: UNTITLED_SCRIPT_NAME,
  description: "",
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
  // The fields of the confirmed document that the state does not hold. The
  // state holds its graph (lastSavedNodes, lastSavedEdges) and paused state.
  let savedMetadata = emptyMetadata();
  const differsFromSaved = (current: ScriptDocumentData) => {
    const state = document.get();
    return !sameScriptDocument(current, {
      ...savedMetadata,
      nodes: state.lastSavedNodes ?? [],
      edges: state.lastSavedEdges ?? [],
      paused: state.lastSavedPaused,
    });
  };
  const currentGroupId = () => ui.get().groupEditStack.at(-1) ?? null;
  const currentCanvas = () => {
    const { nodes, edges } = document.get();
    return canvasGraph(nodes, edges, currentGroupId());
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
  // Commits a graph edit. Null means the edit did not apply.
  const commitGraph = (graph: Partial<ScriptGraph> | null) => {
    if (!graph) return;
    commit((state) => ({ ...state, ...graph, isDirty: true }));
  };
  const commitNodes = (nodes: Node[] | null) => {
    commitGraph(nodes && { nodes });
  };
  // Selection is not part of the document, so it is not an undo step.
  const setSelection = (selected: (node: Node) => boolean) => {
    document.setState((state) => ({
      ...state,
      nodes: selectOnCanvas(state.nodes, currentGroupId(), selected),
    }));
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
  // A new or imported document starts at the root with no previews.
  const resetView = () => {
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
  };
  const toggleNodeFlag = (nodeId: string, key: "muted" | "collapsed") => {
    commitNodes(
      document
        .get()
        .nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, [key]: !node.data[key] } }
            : node,
        ),
    );
  };
  const cutEdgesIntersectingLine: ScriptEditorActions["endLinkCutting"] = (
    drawn,
  ) => {
    const { startPoint: start, endPoint: end } = ui.get().linkCutting;
    if (!start || !end) return;
    // Only cut wires drawn on this canvas. Other groups use other positions.
    const canvas = currentCanvas();
    const shapes = edgeShapes(canvas.nodes, canvas.edges, drawn);
    const removed = new Set(
      canvas.edges
        .filter((edge) => {
          const shape = shapes.get(edge.id);
          return (
            shape !== undefined && polylineCrossesSegment(shape, start, end)
          );
        })
        .map((edge) => edge.id),
    );
    if (removed.size === 0) return;
    const { nodes, edges } = document.get();
    commitGraph({
      edges: normalizeEdgeOrders(
        nodes,
        edges.filter((edge) => !removed.has(edge.id)),
      ),
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
      commitGraph({
        edges: normalizeEdgeOrders(document.get().nodes, nextEdges),
      });
    },
    onConnect: (connection) => {
      const { nodes, edges } = document.get();
      commitGraph({ edges: connectEdge(nodes, edges, connection) });
    },
    onReconnect: (oldEdge, newConnection) => {
      const { nodes, edges } = document.get();
      commitGraph({
        edges: reconnectEdge(nodes, edges, oldEdge, newConnection),
      });
    },
    addNode: (type, position, data = {}) => {
      const newNode: Node = {
        id: generateId(),
        type,
        position,
        data: withParentGroup(data, currentGroupId()),
      };
      commitNodes([...document.get().nodes, newNode]);
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
      const groupId = currentGroupId();
      const deleted = new Set(
        selectedSubgraph(nodes, edges, groupId).nodes.map((n) => n.id),
      );
      // Selected wires in hidden groups stay. Only this canvas shows them.
      const visible = new Set(
        canvasGraph(nodes, edges, groupId).nodes.map((n) => n.id),
      );
      commitGraph({
        nodes: nodes.filter((node) => !deleted.has(node.id)),
        edges: normalizeEdgeOrders(
          nodes,
          edges.filter(
            (edge) =>
              !(
                edge.selected &&
                visible.has(edge.source) &&
                visible.has(edge.target)
              ) &&
              !deleted.has(edge.source) &&
              !deleted.has(edge.target),
          ),
        ),
      });
    },
    disconnectNode: (nodeId) => {
      const { edges, nodes } = document.get();
      commitGraph({
        edges: normalizeEdgeOrders(
          nodes,
          edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
          ),
        ),
      });
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
        const order =
          edge.target === targetNodeId && edge.targetHandle === targetHandleId
            ? orderLookup.get(edge.id)
            : undefined;
        return order === undefined
          ? edge
          : { ...edge, data: { ...edge.data, order } };
      });
      commitGraph({ edges: normalizeEdgeOrders(nodes, reorderedEdges) });
    },
    toggleMute: (nodeId) => {
      toggleNodeFlag(nodeId, "muted");
    },
    toggleCollapse: (nodeId) => {
      toggleNodeFlag(nodeId, "collapsed");
    },
    toggleSocketVisibility: (nodeId) => {
      const { nodes } = document.get();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      // The node component hides unconnected sockets while this marker is set.
      const hidden = nodeDataStrings(node.data, "hiddenSockets") ?? [];
      const hiddenSockets = hidden.length > 0 ? [] : ["__hide_unconnected__"];
      commitNodes(
        nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, hiddenSockets } } : n,
        ),
      );
    },
    togglePreview: (nodeId) => {
      const next = new Set(ui.get().previewEnabledNodes);
      if (!next.delete(nodeId)) next.add(nodeId);
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
      const { nodes } = document.get();
      const frame = createFrame(nodes, nodeIds, currentGroupId(), label);
      commitNodes(frame && [frame, ...nodes]);
    },
    insertReroute: (edgeId, position) => {
      commitGraph(
        insertReroute(document.get(), edgeId, position, currentGroupId()),
      );
    },
    duplicateSelected: () => {
      const { nodes, edges } = document.get();
      const groupId = currentGroupId();
      const selected = selectedSubgraph(nodes, edges, groupId);
      if (selected.nodes.length === 0) return;
      const copy = cloneSubgraph(selected, groupId, { x: 50, y: 50 });
      commitGraph({
        // The copies replace the originals in the selection.
        nodes: [
          ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
          ...copy.nodes,
        ],
        edges: [...edges, ...copy.edges],
      });
    },
    enterGroup: (groupNodeId) => {
      const node = document.get().nodes.find((n) => n.id === groupNodeId);
      if (node?.type !== "layout.group") return;

      ui.setState((state) => ({
        ...state,
        groupEditStack: [...state.groupEditStack, groupNodeId],
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
      const target = byId.get(nodeId);
      if (!target) return false;
      const groupPath: string[] = [];
      let parent = parentGroupOf(target);
      while (parent && byId.has(parent) && !groupPath.includes(parent)) {
        groupPath.unshift(parent);
        const group = byId.get(parent);
        parent = group ? parentGroupOf(group) : null;
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
    createGroupFromSelection: () => {
      commitGraph(groupSelection(document.get(), currentGroupId()));
    },
    ungroupSelected: () => {
      const { selectedNodeId } = ui.get();
      if (!selectedNodeId) return;
      const graph = ungroup(document.get(), selectedNodeId);
      if (!graph) return;
      batch(() => {
        commitGraph(graph);
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
      return findClosestEdge(nodes, edges, position, threshold, drawn);
    },
    insertNodeOnEdge: (nodeId, edgeId) => {
      commitGraph(insertNodeOnEdge(document.get(), nodeId, edgeId));
    },
    clearDebugValues: (nodeId) => {
      const next = new Map(execution.get().debugNodeValues);
      next.delete(nodeId);
      execution.setState((state) => ({ ...state, debugNodeValues: next }));
    },

    selectAll: () => {
      setSelection(() => true);
    },
    deselectAll: () => {
      document.setState((state) => ({
        ...state,
        nodes: state.nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n,
        ),
      }));
    },
    selectShortestPath: (fromNodeId, toNodeId) => {
      // Adds the path to the current selection.
      const path = shortestPath(document.get().edges, fromNodeId, toNodeId);
      setSelection((n) => !!n.selected || path.has(n.id));
    },
    selectLinked: (direction) => {
      const selected = canvasSelection(document.get().nodes, currentGroupId());
      if (selected.length === 0) return;
      const linked = linkedNodes(
        document.get().edges,
        selected.map((n) => n.id),
        direction,
      );
      setSelection((n) => linked.has(n.id));
    },
    selectSimilar: () => {
      const types = new Set(
        canvasSelection(document.get().nodes, currentGroupId()).map(
          (n) => n.type,
        ),
      );
      if (types.size === 0) return;
      setSelection((n) => types.has(n.type));
    },
    getSelectedForClipboard: () => {
      const { nodes, edges } = document.get();
      const selected = selectedSubgraph(nodes, edges, currentGroupId());
      return selected.nodes.length === 0 ? null : selected;
    },
    pasteClipboardData: (pasted, position) => {
      const { nodes, edges } = document.get();
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
      const roots = subgraphRoots(clipboardData.nodes);
      if (roots.length === 0) return;

      // Child positions belong to separate group canvases, not the paste target.
      const centerX =
        roots.reduce((sum, n) => sum + n.position.x, 0) / roots.length;
      const centerY =
        roots.reduce((sum, n) => sum + n.position.y, 0) / roots.length;
      const copy = cloneSubgraph(clipboardData, currentGroupId(), {
        x: position.x - centerX,
        y: position.y - centerY,
      });
      const nextNodes = [
        ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...copy.nodes,
      ];
      commitGraph({
        nodes: nextNodes,
        edges: normalizeEdgeOrders(nextNodes, [...edges, ...copy.edges]),
      });
    },
    alignNodes: (direction) => {
      commitNodes(
        alignSelection(document.get().nodes, currentGroupId(), direction),
      );
    },
    distributeNodes: (direction) => {
      commitNodes(
        distributeSelection(document.get().nodes, currentGroupId(), direction),
      );
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
      if (ui.get().linkCutting.active) cutEdgesIntersectingLine(drawn);
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
      if (current.scriptId !== data.id) {
        actions.loadScript(data);
        return;
      }
      // Compare with the repaired graph that loading would show, so a script
      // from an older client does not reload on every refresh.
      if (
        !current.isDirty &&
        !sameScriptDocument(actions.getScriptData(), {
          ...data,
          ...normalizeScriptGraph(data),
        })
      )
        actions.loadScript(data);
    },
    loadScript: (data) => {
      const { nodes, edges } = normalizeScriptGraph(data);
      savedMetadata = {
        name: data.name,
        description: data.description,
        quotas: data.quotas,
      };
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
          nodes,
          edges,
          isDirty: false,
          lastSavedNodes: nodes,
          lastSavedEdges: edges,
        }));
        resetView();
      });
    },
    loadScriptData: (data) => {
      const { nodes, edges } = normalizeScriptGraph(data);
      batch(() => {
        commit((state) => ({
          ...state,
          nodes,
          edges,
          scriptName: data.name ?? state.scriptName,
          scriptDescription: data.description ?? state.scriptDescription,
          paused: data.paused ?? state.paused,
          quotas: data.quotas,
          isDirty: true,
        }));
        resetView();
      });
    },
    resetEditor: () => {
      savedMetadata = emptyMetadata();
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
        resetView();
        execution.setState((state) => ({
          ...state,
          isActive: false,
          activeNodeId: null,
          activeNodeExecutions: new Map(),
          executionLogs: [],
          nodeExecutionTimes: new Map<string, number[]>(),
        }));
        ui.setState((state) => ({
          ...state,
          quickAddMenu: null,
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
    getScriptData: () => {
      const state = document.get();
      return {
        nodes: state.nodes,
        edges: state.edges,
        name: state.scriptName,
        description: state.scriptDescription,
        paused: state.paused,
        quotas: state.quotas,
      };
    },
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
        times.set(nodeId, [...existing, timeMs].slice(-10));
        return { ...state, nodeExecutionTimes: times };
      });
    },
    markSaved: (data, scriptId, savedPaused = data.paused) => {
      savedMetadata = {
        name: data.name,
        description: data.description,
        quotas: data.quotas,
      };
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

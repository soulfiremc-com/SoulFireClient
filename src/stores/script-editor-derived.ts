import { createStore, type Store, shallow } from "@tanstack/store";
import type { Edge, Node } from "@xyflow/react";
import type {
  ScriptDocumentState,
  ScriptEditorUIState,
  ScriptValidationState,
} from "./script-editor-types";

const VISUAL_NODE_FIELDS = new Set([
  "collapsed",
  "hiddenSockets",
  "isActive",
  "parentFrameId",
]);

// Validation operates on the graph's meaning, independently of canvas layout.
function validationNode(node: Node): Node {
  return {
    id: node.id,
    type: node.type,
    position: { x: 0, y: 0 },
    data: Object.fromEntries(
      Object.entries(node.data).filter(([key]) => !VISUAL_NODE_FIELDS.has(key)),
    ),
  };
}

function validationEdge(edge: Edge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    data: { edgeType: edge.data?.edgeType, order: edge.data?.order },
  };
}

export function createEditorDerivedStores(
  document: Store<ScriptDocumentState>,
  ui: Store<ScriptEditorUIState>,
) {
  const nodes = createStore(() => document.get().nodes);
  const edges = createStore(() => document.get().edges);
  const groupId = createStore(() => {
    const stack = ui.get().groupEditStack;
    return stack[stack.length - 1];
  });
  const visibleNodes = createStore(() => {
    const currentGroup = groupId.get();
    const all = nodes.get();
    return currentGroup === undefined
      ? all
      : all.filter((node) => node.data.parentGroupId === currentGroup);
  });
  const visibleEdges = createStore(() => {
    const currentGroup = groupId.get();
    const all = edges.get();
    if (currentGroup === undefined) return all;
    const ids = new Set(visibleNodes.get().map((node) => node.id));
    return all.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  });
  const validationGraph = createStore<{ nodes: Node[]; edges: Edge[] }>(
    (previous) => {
      const nextNodes = nodes.get().map(validationNode);
      const nextEdges = edges.get().map(validationEdge);
      if (
        previous &&
        previous.nodes.length === nextNodes.length &&
        previous.edges.length === nextEdges.length &&
        nextNodes.every(
          (node, i) =>
            node.id === previous.nodes[i].id &&
            node.type === previous.nodes[i].type &&
            shallow(node.data, previous.nodes[i].data),
        ) &&
        nextEdges.every((edge, i) => {
          const old = previous.edges[i];
          return (
            edge.id === old.id &&
            edge.source === old.source &&
            edge.target === old.target &&
            edge.sourceHandle === old.sourceHandle &&
            edge.targetHandle === old.targetHandle &&
            edge.type === old.type &&
            shallow(edge.data, old.data)
          );
        })
      )
        return previous;
      return { nodes: nextNodes, edges: nextEdges };
    },
  );
  return { visibleNodes, visibleEdges, validationGraph };
}

export type ValidationDiagnostic =
  ScriptValidationState["validationDiagnostics"][number];
export const EMPTY_DIAGNOSTICS: ValidationDiagnostic[] = [];

export function indexDiagnostics(
  diagnostics: ValidationDiagnostic[],
  previous: ReadonlyMap<string, ValidationDiagnostic[]>,
) {
  const next = new Map<string, ValidationDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const list = next.get(diagnostic.nodeId) ?? [];
    list.push(diagnostic);
    next.set(diagnostic.nodeId, list);
  }
  for (const [id, list] of next) {
    const old = previous.get(id);
    if (
      old &&
      old.length === list.length &&
      list.every((item, i) => shallow(item, old[i]))
    )
      next.set(id, old);
  }
  return next;
}

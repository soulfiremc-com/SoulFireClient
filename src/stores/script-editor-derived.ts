import { createStore, type Store, shallow } from "@tanstack/store";
import type { Edge, Node } from "@xyflow/react";
import { debugSources } from "@/lib/script-debug-sources";
import { optionalEdgeFields } from "@/lib/script-edge-fields";
import type {
  ScriptDocumentState,
  ScriptEditorUIState,
  ScriptValidationState,
} from "./script-editor-types";

const VISUAL_NODE_FIELDS = new Set(["collapsed", "hiddenSockets", "isActive"]);

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
    ...optionalEdgeFields({
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }),
    type: edge.type,
    data: { edgeType: edge.data?.["edgeType"], order: edge.data?.["order"] },
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
    return stack.at(-1);
  });
  const visibleNodes = createStore(() => {
    const currentGroup = groupId.get();
    const all = nodes.get();
    const visible = all.filter(
      (node) => (node.data["parentGroupId"] ?? undefined) === currentGroup,
    );
    return visible.length === all.length ? all : visible;
  });
  // Node moves create a new node list. Keep the edge list when its edges stay
  // the same, so nodes that read it do not re-render on every drag frame.
  const visibleEdges = createStore<Edge[]>((previous) => {
    const all = edges.get();
    const ids = new Set(visibleNodes.get().map((node) => node.id));
    const visible = all.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
    const next = visible.length === all.length ? all : visible;
    return previous &&
      previous.length === next.length &&
      previous.every((edge, index) => edge === next[index])
      ? previous
      : next;
  });
  const validationGraph = createStore<{ nodes: Node[]; edges: Edge[] }>(
    (previous) => {
      const nextNodes = nodes.get().map((node) => validationNode(node));
      const nextEdges = edges.get().map((edge) => validationEdge(edge));
      if (
        previous &&
        previous.nodes.length === nextNodes.length &&
        previous.edges.length === nextEdges.length &&
        nextNodes.every((node, i) => {
          const old = previous.nodes[i];
          return (
            old !== undefined &&
            node.id === old.id &&
            node.type === old.type &&
            shallow(node.data, old.data)
          );
        }) &&
        nextEdges.every((edge, i) => {
          const old = previous.edges[i];
          return (
            old !== undefined &&
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
  // Moving nodes keeps the validation graph, so this only reruns on rewiring.
  const debugOutputs = createStore(() => {
    const graph = validationGraph.get();
    return debugSources(graph.nodes, graph.edges);
  });
  return { visibleNodes, visibleEdges, validationGraph, debugOutputs };
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

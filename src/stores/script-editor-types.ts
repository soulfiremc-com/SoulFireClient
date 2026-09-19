import type {
  Connection,
  Edge,
  Node,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  XYPosition,
} from "@xyflow/react";
import type { LogEntry } from "@/components/script-editor/types";
import type { ScriptQuotas } from "@/generated/soulfire/script_pb";

export interface ScriptDocumentState {
  nodes: Node[];
  edges: Edge[];
  scriptId: string | null;
  scriptName: string;
  scriptDescription: string;
  paused: boolean;
  quotas: ScriptQuotas | undefined;
  isDirty: boolean;
  lastSavedNodes: Node[] | null;
  lastSavedEdges: Edge[] | null;
}

export interface ScriptEditorUIState {
  selectedNodeId: string | null;
  quickAddMenu: {
    position: XYPosition;
    screenPosition: XYPosition;
    sourceSocket?: {
      nodeId: string;
      handleId: string;
      handleType: "source" | "target";
    };
  } | null;
  groupEditStack: string[];
  previewEnabledNodes: Set<string>;

  linkCutting: {
    active: boolean;
    startPoint: XYPosition | null;
    endPoint: XYPosition | null;
  };
}

export interface ScriptExecutionState {
  isActive: boolean;
  activeNodeId: string | null;
  executionLogs: LogEntry[];
  previewValues: Map<string, Record<string, unknown>>;
  debugNodeValues: Map<string, Array<{ value: unknown; timestamp: Date }>>;
  nodeExecutionTimes: Map<string, number[]>;
  lastExecutionStats: { nodeCount: number; maxCount: number } | null;
}

export interface ScriptValidationState {
  diagnosticsByNode: ReadonlyMap<
    string,
    ScriptValidationState["validationDiagnostics"]
  >;
  validationDiagnostics: Array<{
    nodeId: string;
    edgeId: string;
    message: string;
    severity: "error" | "warning";
  }>;
}

export interface ScriptEditorActions {
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
  addNode: (
    type: string,
    position: XYPosition,
    data?: Record<string, unknown>,
  ) => string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  deleteSelected: () => void;
  disconnectNode: (nodeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  reorderMultiInputEdges: (
    targetNodeId: string,
    targetHandleId: string,
    orderedEdgeIds: string[],
  ) => void;
  toggleMute: (nodeId: string) => void;
  toggleCollapse: (nodeId: string) => void;
  toggleSocketVisibility: (nodeId: string) => void;
  togglePreview: (nodeId: string) => void;
  updatePreviewValue: (
    nodeId: string,
    outputs: Record<string, unknown>,
  ) => void;
  createFrame: (nodeIds: string[], label?: string) => void;
  removeFromFrame: (nodeId: string) => void;
  insertReroute: (edgeId: string, position: XYPosition) => void;
  duplicateSelected: () => void;
  enterGroup: (groupNodeId: string) => void;
  exitGroup: () => void;
  exitToRoot: () => void;
  createGroupFromSelection: () => void;
  ungroupSelected: () => void;
  getCurrentGroupId: () => string | null;

  findClosestEdge: (position: XYPosition, threshold: number) => Edge | null;
  insertNodeOnEdge: (nodeId: string, edgeId: string) => void;
  updateDebugValue: (nodeId: string, value: unknown) => void;
  clearDebugValues: (nodeId: string) => void;

  selectAll: () => void;
  deselectAll: () => void;
  selectLinked: (direction: "upstream" | "downstream" | "both") => void;
  selectSimilar: () => void;
  selectShortestPath: (fromNodeId: string, toNodeId: string) => void;
  getSelectedForClipboard: () => {
    nodes: Node[];
    edges: Edge[];
    sourceScriptId: string | null;
  } | null;
  pasteClipboardData: (
    data: { nodes: Node[]; edges: Edge[] },
    position: XYPosition,
  ) => void;
  canPaste: () => boolean;
  alignNodes: (
    direction: "left" | "right" | "top" | "bottom" | "centerH" | "centerV",
  ) => void;
  distributeNodes: (direction: "horizontal" | "vertical") => void;
  openQuickAddMenu: (
    position: XYPosition,
    screenPosition: XYPosition,
    sourceSocket?: {
      nodeId: string;
      handleId: string;
      handleType: "source" | "target";
    },
  ) => void;
  closeQuickAddMenu: () => void;
  startLinkCutting: (point: XYPosition) => void;
  updateLinkCutting: (point: XYPosition) => void;
  endLinkCutting: () => void;
  cutEdgesIntersectingLine: (start: XYPosition, end: XYPosition) => void;
  setScriptName: (name: string) => void;
  setScriptDescription: (description: string) => void;
  setPaused: (paused: boolean) => void;
  setQuotas: (quotas: ScriptQuotas | undefined) => void;
  setDirty: (dirty: boolean) => void;
  setActive: (active: boolean) => void;
  setActiveNode: (nodeId: string | null) => void;
  addExecutionLog: (log: LogEntry) => void;
  prependExecutionLogs: (logs: LogEntry[]) => void;
  clearExecutionLogs: () => void;
  loadScript: (data: {
    id: string;
    name: string;
    description: string;
    paused: boolean;
    quotas: ScriptQuotas | undefined;
    nodes: Node[];
    edges: Edge[];
  }) => void;
  loadScriptData: (data: {
    nodes: Node[];
    edges: Edge[];
    name?: string;
    description?: string;
    paused?: boolean;
    quotas?: ScriptQuotas;
  }) => void;
  resetEditor: () => void;
  getScriptData: () => {
    nodes: Node[];
    edges: Edge[];
    name: string;
    description: string;
    paused: boolean;
    quotas: ScriptQuotas | undefined;
  };
  setValidationDiagnostics: (
    diagnostics: Array<{
      nodeId: string;
      edgeId: string;
      message: string;
      severity: "error" | "warning";
    }>,
  ) => void;
  addNodeExecutionTime: (nodeId: string, timeNanos: number) => void;
  setExecutionStats: (stats: { nodeCount: number; maxCount: number }) => void;
  markSaved: () => void;
}

import type { Edge } from "@xyflow/react";
import { type ReactNode, useMemo } from "react";
import { NodeEditingContext } from "./node-editing-context.ts";

interface NodeEditingProviderProps {
  children: ReactNode;
  edges: Edge[];
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  renamingNodeId: string | null;
  clearRenamingNodeId: () => void;
}

export function NodeEditingProvider({
  children,
  edges,
  updateNodeData,
  renamingNodeId,
  clearRenamingNodeId,
}: NodeEditingProviderProps) {
  const value = useMemo(
    () => ({ edges, updateNodeData, renamingNodeId, clearRenamingNodeId }),
    [edges, updateNodeData, renamingNodeId, clearRenamingNodeId],
  );
  return (
    <NodeEditingContext.Provider value={value}>
      {children}
    </NodeEditingContext.Provider>
  );
}

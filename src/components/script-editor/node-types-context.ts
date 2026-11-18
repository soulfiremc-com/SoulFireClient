import type { NodeTypes } from "@xyflow/react";
import { createContext, useContext } from "react";
import type { CategoryInfo, NodeDefinition } from "./nodes/types";

export interface NodeTypesContextValue {
  /** All node definitions keyed by type */
  definitions: Record<string, NodeDefinition>;
  /** React Flow node type components */
  nodeTypes: NodeTypes;
  /** All available categories (from server) */
  categories: string[];
  /** Category info derived from nodes */
  categoryInfo: Record<string, CategoryInfo>;
  /** Get a node definition by type */
  getDefinition: (type: string) => NodeDefinition | undefined;
  /** Get nodes by category */
  getNodesByCategory: (category: string) => NodeDefinition[];
  /** Get category info */
  getCategoryInfo: (category: string) => CategoryInfo;
  /** Create default data for a node type */
  createNodeData: (
    type: string,
    overrides?: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Whether the node types are still loading */
  isLoading: boolean;
}

export const NodeTypesContext = createContext<NodeTypesContextValue | null>(
  null,
);

/**
 * Hook to access node type definitions.
 * Must be used within a NodeTypesProvider.
 */
export function useNodeTypes(): NodeTypesContextValue {
  const context = useContext(NodeTypesContext);
  if (!context) {
    throw new Error("useNodeTypes must be used within a NodeTypesProvider");
  }
  return context;
}

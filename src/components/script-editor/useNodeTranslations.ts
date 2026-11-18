import type { NodeDefinition } from "./nodes/types";

/**
 * Get the label for a node type.
 * Uses server-provided displayName.
 */
const getNodeLabel = (node: NodeDefinition): string => {
  return node.label;
};
/**
 * Get the description for a node type.
 * Uses server-provided description.
 */
const getNodeDescription = (node: NodeDefinition): string => {
  return node.description ?? "";
};
/**
 * Get the name for a node category.
 * Uses server-provided displayName (fallback parameter).
 */
const getCategoryName = (_categoryId: string, fallback: string): string => {
  return fallback;
};
/**
 * Get the label for an inspector field.
 * Returns the field key as-is (server-sent i18n planned for future).
 */
const getFieldLabel = (fieldKey: string): string => {
  return fieldKey;
};
/**
 * Get port label.
 * Uses server-provided label.
 */
const getPortLabel = (_portId: string, fallback: string): string => {
  return fallback;
};

/**
 * Hook that provides label functions for script editor nodes and categories.
 * Uses server-provided displayNames directly (server-sent i18n planned for future).
 */
export function useNodeTranslations() {
  return {
    getNodeLabel,
    getNodeDescription,
    getCategoryName,
    getFieldLabel,
    getPortLabel,
  };
}

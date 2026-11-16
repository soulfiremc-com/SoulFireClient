import type { Connection, Edge, IsValidConnection, Node } from "@xyflow/react";
import {
  getPortDefinition,
  getPortTypeFromDefinition,
  isDescriptorCompatible,
  isTypeCompatible,
  type PortType,
  simpleType,
  type TypeDescriptor,
} from "@/components/script-editor/nodes/types";

/**
 * Check if a source type can be converted to a target type.
 * Uses the server-provided type compatibility metadata (via isTypeCompatible)
 * as the single source of truth, with fallback to basic rules.
 */
export function canConvertType(
  sourceType: PortType,
  targetType: PortType,
): boolean {
  // Same type always works
  if (sourceType === targetType) return true;

  // Any type is universal
  if (sourceType === "any" || targetType === "any") return true;

  // Use server-provided compatibility rules
  return isTypeCompatible(sourceType, targetType);
}

/**
 * Check if a source TypeDescriptor can connect to a target TypeDescriptor.
 * Uses unification for generic type checking.
 */
export function canConvertDescriptor(
  source: TypeDescriptor,
  target: TypeDescriptor,
): boolean {
  return isDescriptorCompatible(source, target);
}

/**
 * Get port type from node definition.
 * Returns the port type or "any" if not found.
 */
function getPortType(
  nodes: Node[],
  nodeId: string,
  handleId: string | null | undefined,
): PortType {
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
}

/**
 * Get the TypeDescriptor for a port, falling back to simple type.
 */
function getPortDescriptor(
  nodes: Node[],
  nodeId: string,
  handleId: string | null | undefined,
): TypeDescriptor {
  if (!handleId) return simpleType("any");

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return simpleType("any");

  const portDef = getPortDefinition(node.type ?? "", handleId);
  if (portDef?.typeDescriptor) return portDef.typeDescriptor;
  if (portDef) return simpleType(portDef.type);

  // Fallback for layout nodes
  const nodeData = node.data as { resolvedType?: PortType } | undefined;
  if (nodeData?.resolvedType) return simpleType(nodeData.resolvedType);

  return simpleType("any");
}

export type ConnectionProblem =
  | { kind: "self" }
  | { kind: "execution"; sourceType: PortType; targetType: PortType }
  | { kind: "type"; sourceType: PortType; targetType: PortType };

/**
 * Explains why a connection is not allowed, or returns null when it is.
 * Supports generic type descriptors with type variable unification.
 */
export function getConnectionProblem(
  nodes: Node[],
  connection: Edge | Connection,
): ConnectionProblem | null {
  // A node wired to itself never finishes or depends on its own result.
  if (connection.source === connection.target) return { kind: "self" };

  const sourceType = getPortType(
    nodes,
    connection.source,
    connection.sourceHandle,
  );
  const targetType = getPortType(
    nodes,
    connection.target,
    connection.targetHandle,
  );

  // Execution ports only connect to execution ports
  if (sourceType === "execution" && targetType === "execution") return null;
  if (sourceType === "execution" || targetType === "execution")
    return { kind: "execution", sourceType, targetType };

  const sourceDesc = getPortDescriptor(
    nodes,
    connection.source,
    connection.sourceHandle,
  );
  const targetDesc = getPortDescriptor(
    nodes,
    connection.target,
    connection.targetHandle,
  );
  return canConvertDescriptor(sourceDesc, targetDesc)
    ? null
    : { kind: "type", sourceType, targetType };
}

/**
 * Creates a connection validator that uses node definitions to determine port types.
 *
 * @param nodes The current nodes in the graph
 * @returns An IsValidConnection function for React Flow
 */
export function createConnectionValidator(nodes: Node[]): IsValidConnection {
  return (connection) => getConnectionProblem(nodes, connection) === null;
}

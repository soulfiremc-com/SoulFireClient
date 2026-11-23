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

const GROUP_PORT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "layout.group": ["inputs", "outputs"],
  "layout.group_input": ["outputs"],
  "layout.group_output": ["inputs"],
};

// Group ports keep the type of the wire they replaced. Only execution counts
// here: a data port passes values on to inner inputs of other types.
function isGroupExecutionPort(node: Node, handleId: string): boolean {
  return (GROUP_PORT_FIELDS[node.type ?? ""] ?? []).some((field) => {
    const ports: unknown = node.data[field];
    return (
      Array.isArray(ports) &&
      ports.some(
        (port: unknown) =>
          typeof port === "object" &&
          port !== null &&
          "id" in port &&
          "type" in port &&
          port.id === handleId &&
          port.type === "execution",
      )
    );
  });
}

/**
 * Looks up a port's type in the node definitions, then in the types that
 * reroute and group nodes store. Returns "any" when neither knows the port.
 */
export function getPortType(
  nodes: Node[],
  nodeId: string,
  handleId: string | null | undefined,
): PortType {
  if (!handleId) return "any";

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return "any";

  const portType = getPortTypeFromDefinition(node.type ?? "", handleId);
  if (portType) return portType;

  const nodeData = node.data as { resolvedType?: PortType } | undefined;
  if (nodeData?.resolvedType) return nodeData.resolvedType;

  return isGroupExecutionPort(node, handleId) ? "execution" : "any";
}

/**
 * Get the TypeDescriptor for a port, falling back to simple type.
 */
function getPortDescriptor(
  nodes: Node[],
  nodeId: string,
  handleId: string | null | undefined,
): TypeDescriptor {
  const node = handleId ? nodes.find((n) => n.id === nodeId) : undefined;
  const portDef =
    node && handleId ? getPortDefinition(node.type ?? "", handleId) : undefined;
  if (portDef?.typeDescriptor) return portDef.typeDescriptor;
  return simpleType(getPortType(nodes, nodeId, handleId));
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
  return isDescriptorCompatible(sourceDesc, targetDesc)
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

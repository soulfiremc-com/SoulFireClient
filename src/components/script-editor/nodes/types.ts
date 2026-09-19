import {
  type CategoryDefinition as ProtoCategoryDefinition,
  EdgeStyle as ProtoEdgeStyle,
  HandleShape as ProtoHandleShape,
  type NodeTypeDefinition as ProtoNodeTypeDefinition,
  type PortDefinition as ProtoPortDefinition,
  PortType as ProtoPortType,
  type TypeDescriptor as ProtoTypeDescriptor,
} from "@/generated/soulfire/script_pb";

export type PortType =
  | "execution"
  | "number"
  | "boolean"
  | "string"
  | "vector3"
  | "entity"
  | "bot"
  | "block"
  | "item"
  | "list"
  | "map"
  | "set"
  | "collection"
  | "any";

/**
 * Standard port names - must match backend StandardPorts.java
 */
export const StandardPorts = {
  EXEC_IN: "in",
  EXEC_OUT: "out",
  EXEC_TRUE: "true",
  EXEC_FALSE: "false",
  EXEC_LOOP: "loop",
  EXEC_DONE: "done",
} as const;

export type NodeCategory = string;

// ==================== Type Descriptor ====================

/**
 * A recursive type descriptor for generic/parameterized port types.
 * Supports simple types, parameterized types (List<Bot>, Map<String, Number>),
 * and type variables (T, K, V) that are resolved based on connections.
 */
export type TypeDescriptor =
  | { kind: "simple"; type: PortType }
  | { kind: "parameterized"; base: PortType; params: TypeDescriptor[] }
  | { kind: "type_variable"; name: string };

/**
 * Create a simple type descriptor.
 */
export function simpleType(type: PortType): TypeDescriptor {
  return { kind: "simple", type };
}

/**
 * Create a type variable descriptor.
 */
export function typeVar(name: string): TypeDescriptor {
  return { kind: "type_variable", name };
}

/**
 * Create a parameterized list type: List<elementType>.
 */
export function listType(elementType: TypeDescriptor): TypeDescriptor {
  return { kind: "parameterized", base: "list", params: [elementType] };
}

/**
 * Create a parameterized map type: Map<keyType, valueType>.
 */
export function mapType(
  keyType: TypeDescriptor,
  valueType: TypeDescriptor,
): TypeDescriptor {
  return { kind: "parameterized", base: "map", params: [keyType, valueType] };
}

/**
 * Get the base PortType from a TypeDescriptor (for backward compat and handle rendering).
 */
export function getBaseType(td: TypeDescriptor): PortType {
  switch (td.kind) {
    case "simple":
      return td.type;
    case "parameterized":
      return td.base;
    case "type_variable":
      return "any";
  }
}

/**
 * Get a human-readable display string for a TypeDescriptor.
 */
export function typeDescriptorDisplayString(td: TypeDescriptor): string {
  switch (td.kind) {
    case "simple":
      return td.type;
    case "parameterized":
      return `${td.base}<${td.params.map(typeDescriptorDisplayString).join(", ")}>`;
    case "type_variable":
      return td.name;
  }
}

/**
 * Check whether a TypeDescriptor contains any type variables.
 */
export function hasTypeVariables(td: TypeDescriptor): boolean {
  switch (td.kind) {
    case "simple":
      return false;
    case "parameterized":
      return td.params.some(hasTypeVariables);
    case "type_variable":
      return true;
  }
}

/**
 * Resolve type variables using the given bindings map.
 */
export function resolveTypeDescriptor(
  td: TypeDescriptor,
  bindings: Map<string, TypeDescriptor>,
): TypeDescriptor {
  switch (td.kind) {
    case "simple":
      return td;
    case "parameterized":
      return {
        kind: "parameterized",
        base: td.base,
        params: td.params.map((p) => resolveTypeDescriptor(p, bindings)),
      };
    case "type_variable": {
      const bound = bindings.get(td.name);
      if (bound) {
        return resolveTypeDescriptor(bound, bindings);
      }
      return td;
    }
  }
}

/**
 * Attempt to unify two type descriptors, updating bindings for type variables.
 * Returns true if unification succeeds.
 */
export function unifyTypes(
  a: TypeDescriptor,
  b: TypeDescriptor,
  bindings: Map<string, TypeDescriptor>,
): boolean {
  const resolvedA = resolveTypeDescriptor(a, bindings);
  const resolvedB = resolveTypeDescriptor(b, bindings);

  // TypeVariable on either side: bind it
  if (resolvedA.kind === "type_variable") {
    bindings.set(resolvedA.name, resolvedB);
    return true;
  }
  if (resolvedB.kind === "type_variable") {
    bindings.set(resolvedB.name, resolvedA);
    return true;
  }

  // ANY on either side matches everything
  if (resolvedA.kind === "simple" && resolvedA.type === "any") return true;
  if (resolvedB.kind === "simple" && resolvedB.type === "any") return true;

  // Simple vs Simple
  if (resolvedA.kind === "simple" && resolvedB.kind === "simple") {
    return isTypeCompatible(resolvedA.type, resolvedB.type);
  }

  // Parameterized vs Parameterized
  if (
    resolvedA.kind === "parameterized" &&
    resolvedB.kind === "parameterized"
  ) {
    if (
      resolvedA.base !== resolvedB.base ||
      resolvedA.params.length !== resolvedB.params.length
    ) {
      return false;
    }
    for (let i = 0; i < resolvedA.params.length; i++) {
      if (!unifyTypes(resolvedA.params[i], resolvedB.params[i], bindings)) {
        return false;
      }
    }
    return true;
  }

  // Simple LIST/MAP vs Parameterized LIST/MAP (backward compat)
  if (resolvedA.kind === "simple" && resolvedB.kind === "parameterized") {
    if (resolvedA.type === resolvedB.base) return true;
  }
  if (resolvedB.kind === "simple" && resolvedA.kind === "parameterized") {
    if (resolvedB.type === resolvedA.base) return true;
  }

  return false;
}

/**
 * Resolve type variables for a node based on its connected edges.
 * Returns a map of variable name to resolved TypeDescriptor.
 */
export function resolveNodeTypeVars(
  nodeType: string,
  connectedInputTypes: Map<string, TypeDescriptor>,
): Map<string, TypeDescriptor> {
  const def = nodeDefinitionsByType.get(nodeType);
  if (!def) return new Map();

  const bindings = new Map<string, TypeDescriptor>();

  // For each connected input, try to unify with the port's type descriptor
  for (const [portId, sourceType] of connectedInputTypes) {
    const port = def.inputs.find((p) => p.id === portId);
    if (!port?.typeDescriptor) continue;
    unifyTypes(sourceType, port.typeDescriptor, bindings);
  }

  return bindings;
}

/**
 * Get the resolved PortType for a port, given the node's type variable bindings.
 * If the port has a TypeDescriptor with type variables, resolves them and returns
 * the base type of the resolved descriptor. Otherwise returns the static port type.
 */
export function getResolvedPortType(
  port: PortDefinition,
  bindings: Map<string, TypeDescriptor>,
): PortType {
  if (!port.typeDescriptor || !hasTypeVariables(port.typeDescriptor)) {
    return port.type;
  }
  const resolved = resolveTypeDescriptor(port.typeDescriptor, bindings);
  if (!hasTypeVariables(resolved)) {
    return getBaseType(resolved);
  }
  return port.type;
}

// ==================== Port Definition ====================

export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
  defaultValue?: string;
  description?: string;
  elementType?: PortType;
  /** Whether this input accepts multiple connections (Blender-style multi-input) */
  multiInput?: boolean;
  /** For polymorphic ports, the list of accepted types */
  acceptedTypes?: PortType[];
  /** For dynamic output ports, the ID of the input port to inherit type from */
  inferTypeFrom?: string;
  /** Generic type descriptor for parameterized types */
  typeDescriptor?: TypeDescriptor;
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  icon: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaultData?: Record<string, unknown>;
  description?: string;
  isTrigger?: boolean;
  keywords?: string[];
  deprecated?: boolean;
  deprecationMessage?: string;
  color?: string;
  /** Whether this is a layout node (reroute, frame, etc.) with special rendering */
  isLayoutNode?: boolean;
  /** Whether this node can be muted (bypassed during execution) */
  supportsMuting?: boolean;
  /** Whether this node supports inline preview of its output */
  supportsPreview?: boolean;
}

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  description?: string;
  sortOrder: number;
}

/**
 * Convert proto PortType enum to local string type
 */
export function protoPortTypeToLocal(protoType: ProtoPortType): PortType {
  switch (protoType) {
    case ProtoPortType.ANY:
      return "any";
    case ProtoPortType.NUMBER:
      return "number";
    case ProtoPortType.STRING:
      return "string";
    case ProtoPortType.BOOLEAN:
      return "boolean";
    case ProtoPortType.VECTOR3:
      return "vector3";
    case ProtoPortType.BOT:
      return "bot";
    case ProtoPortType.LIST:
      return "list";
    case ProtoPortType.EXEC:
      return "execution";
    case ProtoPortType.BLOCK:
      return "block";
    case ProtoPortType.ENTITY:
      return "entity";
    case ProtoPortType.ITEM:
      return "item";
    case ProtoPortType.MAP:
      return "map";
    case ProtoPortType.SET:
      return "set";
    case ProtoPortType.COLLECTION:
      return "collection";
    default:
      return "any";
  }
}

/**
 * Convert proto TypeDescriptor to local TypeDescriptor
 */
export function protoTypeDescriptorToLocal(
  proto: ProtoTypeDescriptor | undefined,
): TypeDescriptor | undefined {
  if (!proto?.kind) return undefined;

  const kind = proto.kind;
  if (kind.case === "simple") {
    return simpleType(protoPortTypeToLocal(kind.value as ProtoPortType));
  }
  if (kind.case === "parameterized") {
    const p = kind.value;
    return {
      kind: "parameterized",
      base: protoPortTypeToLocal(p.base),
      params: p.params
        .map(protoTypeDescriptorToLocal)
        .filter((td): td is TypeDescriptor => td !== undefined),
    };
  }
  if (kind.case === "typeVariable") {
    return typeVar(kind.value as string);
  }

  return undefined;
}

/**
 * Convert proto PortDefinition to local PortDefinition
 */
export function protoPortToLocal(proto: ProtoPortDefinition): PortDefinition {
  return {
    id: proto.id,
    label: proto.displayName,
    type: protoPortTypeToLocal(proto.portType),
    required: proto.required || undefined,
    defaultValue: proto.defaultValue,
    description: proto.description || undefined,
    elementType:
      proto.elementType !== undefined
        ? protoPortTypeToLocal(proto.elementType)
        : undefined,
    multiInput: proto.multiInput || undefined,
    acceptedTypes:
      proto.acceptedTypes && proto.acceptedTypes.length > 0
        ? proto.acceptedTypes.map(protoPortTypeToLocal)
        : undefined,
    inferTypeFrom: proto.inferTypeFrom || undefined,
    typeDescriptor: proto.typeDescriptor
      ? protoTypeDescriptorToLocal(proto.typeDescriptor)
      : undefined,
  };
}

/**
 * Convert proto NodeTypeDefinition to local NodeDefinition
 */
export function protoNodeTypeToLocal(
  proto: ProtoNodeTypeDefinition,
): NodeDefinition {
  // Parse default values from port definitions
  // Port IDs are now simple names (e.g., "interval", "message")
  const defaultData: Record<string, unknown> = {};
  for (const input of proto.inputs) {
    if (input.defaultValue !== undefined) {
      try {
        defaultData[input.id] = JSON.parse(input.defaultValue);
      } catch {
        // If JSON parsing fails, use the raw string value
        defaultData[input.id] = input.defaultValue;
      }
    }
  }

  return {
    type: proto.type,
    label: proto.displayName,
    category: proto.category,
    icon: proto.icon || "Circle",
    inputs: proto.inputs.map(protoPortToLocal),
    outputs: proto.outputs.map(protoPortToLocal),
    defaultData: Object.keys(defaultData).length > 0 ? defaultData : undefined,
    description: proto.description || undefined,
    isTrigger: proto.isTrigger || undefined,
    keywords: proto.keywords.length > 0 ? proto.keywords : undefined,
    deprecated: proto.deprecated || undefined,
    deprecationMessage: proto.deprecationMessage || undefined,
    color: proto.color || undefined,
    isLayoutNode: proto.isLayoutNode || undefined,
    supportsMuting: proto.supportsMuting || undefined,
    supportsPreview: proto.supportsPreview || undefined,
  };
}

/**
 * Handle shape for port handles - data-driven from server.
 */
export type HandleShape = "circle" | "square" | "diamond";

/**
 * Edge style for connections - data-driven from server.
 */
export type EdgeStyle = "default" | "animated" | "dashed";

/**
 * Default port type colors - used as fallback when server data is unavailable.
 * These are overridden by server-provided colors via PortTypeMetadata.
 */
export const DEFAULT_PORT_COLORS: Record<PortType, string> = {
  execution: "#ffffff",
  number: "#22c55e",
  boolean: "#ef4444",
  string: "#eab308",
  vector3: "#3b82f6",
  entity: "#a855f7",
  bot: "#f97316",
  block: "#06b6d4",
  item: "#ec4899",
  list: "#8b5cf6",
  map: "#14b8a6",
  set: "#0ea5e9",
  collection: "#6366f1",
  any: "#6b7280",
};

/**
 * Default handle shapes - used as fallback when server data is unavailable.
 */
export const DEFAULT_HANDLE_SHAPES: Record<PortType, HandleShape> = {
  execution: "square",
  number: "circle",
  boolean: "circle",
  string: "circle",
  vector3: "circle",
  entity: "circle",
  bot: "circle",
  block: "circle",
  item: "circle",
  list: "circle",
  map: "diamond",
  set: "diamond",
  collection: "diamond",
  any: "circle",
};

/**
 * Default edge styles - used as fallback when server data is unavailable.
 */
export const DEFAULT_EDGE_STYLES: Record<PortType, EdgeStyle> = {
  execution: "animated",
  number: "default",
  boolean: "default",
  string: "default",
  vector3: "default",
  entity: "default",
  bot: "default",
  block: "default",
  item: "default",
  list: "default",
  map: "default",
  set: "default",
  collection: "default",
  any: "default",
};

/**
 * Default type compatibility rules - used as fallback when server data is unavailable.
 * Maps target types to source types that can be implicitly converted.
 */
export const DEFAULT_TYPE_COMPATIBILITY: Partial<Record<PortType, PortType[]>> =
  {
    number: ["string", "boolean"],
    boolean: ["number", "string"],
    string: ["number", "boolean"],
    any: [
      "number",
      "string",
      "boolean",
      "vector3",
      "entity",
      "bot",
      "block",
      "item",
      "list",
      "map",
    ],
  };

// Runtime store for server-provided port metadata
let serverPortColors: Record<string, string> = {};
let serverTypeCompatibility: Record<string, string[]> = {};
let serverHandleShapes: Record<string, HandleShape> = {};
let serverEdgeStyles: Record<string, EdgeStyle> = {};

// Runtime store for node definitions (for port type lookup)
let nodeDefinitionsByType: Map<string, NodeDefinition> = new Map();

/**
 * Initialize node definitions for port type lookup.
 * Call this when GetNodeTypesResponse is received.
 */
export function initNodeDefinitions(definitions: NodeDefinition[]): void {
  nodeDefinitionsByType = new Map(definitions.map((d) => [d.type, d]));
}

/**
 * Get a node definition by type.
 */
export function getNodeDefinition(
  nodeType: string,
): NodeDefinition | undefined {
  return nodeDefinitionsByType.get(nodeType);
}

/**
 * Look up the port type for a given node type and port ID.
 * Returns null if the node type or port is not found.
 */
export function getPortTypeFromDefinition(
  nodeType: string,
  portId: string,
): PortType | null {
  const def = nodeDefinitionsByType.get(nodeType);
  if (!def) return null;

  const input = def.inputs.find((p) => p.id === portId);
  if (input) return input.type;

  const output = def.outputs.find((p) => p.id === portId);
  if (output) return output.type;

  return null;
}

/**
 * Look up the port definition for a given node type and port ID.
 */
export function getPortDefinition(
  nodeType: string,
  portId: string,
): PortDefinition | null {
  const def = nodeDefinitionsByType.get(nodeType);
  if (!def) return null;

  const input = def.inputs.find((p) => p.id === portId);
  if (input) return input;

  const output = def.outputs.find((p) => p.id === portId);
  if (output) return output;

  return null;
}

/**
 * Check if a port is an execution port.
 */
export function isExecutionPort(nodeType: string, portId: string): boolean {
  return getPortTypeFromDefinition(nodeType, portId) === "execution";
}

/**
 * Check if a port accepts multiple connections.
 */
export function isPortMultiInput(nodeType: string, portId: string): boolean {
  const def = nodeDefinitionsByType.get(nodeType);
  if (!def) return false;
  const input = def.inputs.find((p) => p.id === portId);
  return input?.multiInput === true;
}

/**
 * Convert proto HandleShape enum to local string type
 */
function protoHandleShapeToLocal(protoShape: ProtoHandleShape): HandleShape {
  switch (protoShape) {
    case ProtoHandleShape.CIRCLE:
      return "circle";
    case ProtoHandleShape.SQUARE:
      return "square";
    case ProtoHandleShape.DIAMOND:
      return "diamond";
    default:
      return "circle";
  }
}

/**
 * Convert proto EdgeStyle enum to local string type
 */
function protoEdgeStyleToLocal(protoStyle: ProtoEdgeStyle): EdgeStyle {
  switch (protoStyle) {
    case ProtoEdgeStyle.DEFAULT:
      return "default";
    case ProtoEdgeStyle.ANIMATED:
      return "animated";
    case ProtoEdgeStyle.DASHED:
      return "dashed";
    default:
      return "default";
  }
}

/**
 * Initialize port metadata from server response.
 * Call this when GetNodeTypesResponse is received.
 */
export function initPortMetadata(
  metadata: Array<{
    portType: ProtoPortType;
    color: string;
    compatibleFrom: ProtoPortType[];
    handleShape: ProtoHandleShape;
    edgeStyle: ProtoEdgeStyle;
  }>,
): void {
  serverPortColors = {};
  serverTypeCompatibility = {};
  serverHandleShapes = {};
  serverEdgeStyles = {};

  for (const meta of metadata) {
    const portType = protoPortTypeToLocal(meta.portType);
    if (meta.color) {
      serverPortColors[portType] = meta.color;
    }
    if (meta.compatibleFrom && meta.compatibleFrom.length > 0) {
      serverTypeCompatibility[portType] =
        meta.compatibleFrom.map(protoPortTypeToLocal);
    }
    // Always set handle shape and edge style (proto provides defaults)
    serverHandleShapes[portType] = protoHandleShapeToLocal(meta.handleShape);
    serverEdgeStyles[portType] = protoEdgeStyleToLocal(meta.edgeStyle);
  }
}

/**
 * Get the color for a port type.
 * Uses server-provided color if available, falls back to default.
 */
export function getPortColor(type: PortType): string {
  return (
    serverPortColors[type] ??
    DEFAULT_PORT_COLORS[type] ??
    DEFAULT_PORT_COLORS.any
  );
}

/**
 * Get the handle shape for a port type.
 * Uses server-provided shape if available, falls back to default.
 */
export function getHandleShape(type: PortType): HandleShape {
  return (
    serverHandleShapes[type] ??
    DEFAULT_HANDLE_SHAPES[type] ??
    DEFAULT_HANDLE_SHAPES.any
  );
}

/**
 * Get the edge style for a port type.
 * Uses server-provided style if available, falls back to default.
 */
export function getEdgeStyle(type: PortType): EdgeStyle {
  return (
    serverEdgeStyles[type] ??
    DEFAULT_EDGE_STYLES[type] ??
    DEFAULT_EDGE_STYLES.any
  );
}

/**
 * Check if a source type can be connected to a target type.
 * Uses server-provided compatibility rules if available.
 */
export function isTypeCompatible(
  sourceType: PortType,
  targetType: PortType,
): boolean {
  // Exact match is always compatible
  if (sourceType === targetType) return true;

  // Any accepts everything
  if (targetType === "any") return true;
  if (sourceType === "any") return true;

  // Check server-provided compatibility
  const serverCompat = serverTypeCompatibility[targetType];
  if (serverCompat) {
    return serverCompat.includes(sourceType);
  }

  // Fall back to default compatibility
  const defaultCompat = DEFAULT_TYPE_COMPATIBILITY[targetType];
  return defaultCompat?.includes(sourceType) ?? false;
}

/**
 * Check if a source TypeDescriptor can be connected to a target TypeDescriptor.
 * Handles generics and type variables via unification.
 */
export function isDescriptorCompatible(
  source: TypeDescriptor,
  target: TypeDescriptor,
): boolean {
  return unifyTypes(source, target, new Map());
}

/**
 * Convert proto CategoryDefinition to local CategoryInfo
 */
export function protoCategoryToLocal(
  proto: ProtoCategoryDefinition,
): CategoryInfo {
  return {
    id: proto.id,
    name: proto.displayName,
    icon: proto.icon || "Circle",
    description: proto.description || undefined,
    sortOrder: proto.sortOrder,
  };
}

/**
 * Get the border color style for a node based on its color property.
 * Falls back to a default gray if no color is specified.
 */
export function getNodeBorderStyle(color?: string): string {
  if (!color) {
    return "border-l-gray-500";
  }
  // Use inline style for dynamic colors from server
  return "";
}

/**
 * Get inline border color style for a node
 */
export function getNodeBorderColor(color?: string): React.CSSProperties {
  if (!color) {
    return {};
  }
  return { borderLeftColor: color };
}

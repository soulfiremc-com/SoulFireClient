import { create } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import {
  ListValueSchema,
  StructSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  EdgeType,
  type GetNodeTypesRequest,
  type GetNodeTypesResponse,
  type NodeTypeDefinition,
  PortType,
  PositionSchema,
  type PortDefinition as ProtoPortDefinition,
  type ScriptData,
  type ScriptEdge,
  ScriptEdgeSchema,
  type ScriptNode,
  ScriptNodeSchema,
  ScriptService,
} from "@soulfiremc/sdk/generated/soulfire/script_pb";
import { queryOptions } from "@tanstack/react-query";
import type { Edge, Node } from "@xyflow/react";

export type {
  GetNodeTypesRequest,
  GetNodeTypesResponse,
  NodeTypeDefinition,
  ProtoPortDefinition,
  ScriptData,
  ScriptEdge,
  ScriptNode,
};
// Re-export for convenience
export { EdgeType, PortType };

/**
 * Query options for listing all scripts in an instance
 */
export function scriptListQueryOptions(
  transport: Transport | null,
  instanceId: string,
) {
  return queryOptions({
    queryKey: ["scripts", instanceId],
    queryFn: async ({ signal }) => {
      if (!transport) {
        return { scripts: [] };
      }
      const client = createClient(ScriptService, transport);
      const result = await client.listScripts(
        { instanceId },
        { signal: signal },
      );
      return result;
    },
    refetchInterval: 10_000,
  });
}

/**
 * Query options for getting a single script by ID
 */
export function scriptQueryOptions(
  transport: Transport | null,
  instanceId: string,
  scriptId: string,
) {
  return queryOptions({
    queryKey: ["script", instanceId, scriptId],
    queryFn: async ({ signal }) => {
      if (!transport) {
        return null;
      }
      const client = createClient(ScriptService, transport);
      const result = await client.getScript(
        { instanceId, scriptId },
        { signal: signal },
      );
      return result.script;
    },
    enabled: scriptId !== "new",
  });
}

/**
 * Query options for getting script execution status
 */
export function scriptStatusQueryOptions(
  transport: Transport | null,
  instanceId: string,
  scriptId: string,
) {
  return queryOptions({
    queryKey: ["script-status", instanceId, scriptId],
    queryFn: async ({ signal }) => {
      if (!transport) {
        return null;
      }
      const client = createClient(ScriptService, transport);
      const result = await client.getScriptStatus(
        { instanceId, scriptId },
        { signal: signal },
      );
      return result.status;
    },
    enabled: scriptId !== "new",
    refetchInterval: 2_000,
  });
}

/**
 * Query options for getting all available node types.
 * Node types are cacheable - they only change between server versions.
 */
export function nodeTypesQueryOptions(
  transport: Transport | null,
  options?: {
    category?: string;
    includeDeprecated?: boolean;
  },
) {
  return queryOptions({
    queryKey: [
      "node-types",
      options?.category ?? null,
      options?.includeDeprecated ?? false,
    ],
    queryFn: async ({ signal }) => {
      if (!transport) {
        return { nodeTypes: [], categories: [], portTypeMetadata: [] };
      }
      const client = createClient(ScriptService, transport);
      const result = await client.getNodeTypes(
        {
          category: options?.category,
          includeDeprecated: options?.includeDeprecated ?? false,
        },
        { signal: signal },
      );
      return result;
    },
    // Node types rarely change, so use a long stale time
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Query options for getting Minecraft registry data.
 * Registry data is cacheable - it only changes between server versions.
 */
export function registryDataQueryOptions(
  transport: Transport | null,
  registry?: string,
) {
  return queryOptions({
    queryKey: ["registry-data", registry ?? "all"],
    queryFn: async ({ signal }) => {
      if (!transport) {
        return { blocks: [], entities: [], items: [], biomes: [] };
      }
      const client = createClient(ScriptService, transport);
      const result = await client.getRegistryData(
        { registry },
        { signal: signal },
      );
      return result;
    },
    // Registry data rarely changes, so use a long stale time
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

// =============================================================================
// Data Conversion Helpers
// =============================================================================

/**
 * Convert a JavaScript value to a protobuf Value
 */
function toProtoValue(value: unknown): Value {
  if (value === null || value === undefined) {
    return create(ValueSchema, { kind: { case: "nullValue", value: 0 } });
  }
  if (typeof value === "boolean") {
    return create(ValueSchema, {
      kind: { case: "boolValue", value },
    });
  }
  if (typeof value === "number") {
    return create(ValueSchema, {
      kind: { case: "numberValue", value },
    });
  }
  if (typeof value === "string") {
    return create(ValueSchema, {
      kind: { case: "stringValue", value },
    });
  }
  if (Array.isArray(value)) {
    return create(ValueSchema, {
      kind: {
        case: "listValue",
        value: create(ListValueSchema, { values: value.map(toProtoValue) }),
      },
    });
  }
  if (typeof value === "object") {
    const fields: { [key: string]: Value } = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toProtoValue(v);
    }
    return create(ValueSchema, {
      kind: {
        case: "structValue",
        value: create(StructSchema, { fields }),
      },
    });
  }
  return create(ValueSchema, { kind: { case: "nullValue", value: 0 } });
}

/**
 * Convert a protobuf Value to a JavaScript value
 */
function fromProtoValue(value: Value): unknown {
  if (!value.kind) return null;
  switch (value.kind.case) {
    case "nullValue":
      return null;
    case "boolValue":
      return value.kind.value;
    case "numberValue":
      return value.kind.value;
    case "stringValue":
      return value.kind.value;
    case "listValue":
      return value.kind.value.values.map(fromProtoValue);
    case "structValue": {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value.kind.value.fields)) {
        result[k] = fromProtoValue(v);
      }
      return result;
    }
    default:
      return null;
  }
}

/**
 * Convert React Flow nodes to proto ScriptNodes
 */
export function nodesToProto(nodes: Node[]): ScriptNode[] {
  return nodes.map((node) => {
    const data: { [key: string]: Value } = {};
    const nodeData = node.data as Record<string, unknown>;
    if (nodeData && typeof nodeData === "object") {
      for (const [key, value] of Object.entries(nodeData)) {
        // Skip internal fields that are handled separately
        if (
          [
            "muted",
            "collapsed",
            "label",
            "containedNodes",
            "resolvedType",
            "parentFrameId",
            "isActive",
            "hiddenSockets",
          ].includes(key)
        ) {
          continue;
        }
        data[key] = toProtoValue(value);
      }
    }
    return create(ScriptNodeSchema, {
      id: node.id,
      type: node.type ?? "unknown",
      position: create(PositionSchema, {
        x: node.position.x,
        y: node.position.y,
      }),
      data,
      muted: (nodeData?.muted as boolean) ?? false,
      collapsed: (nodeData?.collapsed as boolean) ?? false,
      label: (nodeData?.label as string) ?? "",
      containedNodes: (nodeData?.containedNodes as string[]) ?? [],
      parentFrameId: (nodeData?.parentFrameId as string) ?? "",
      width: node.width ?? node.measured?.width,
      height: node.height ?? node.measured?.height,
      resolvedType: nodeData?.resolvedType as PortType | undefined,
    });
  });
}

/**
 * Convert proto ScriptNodes to React Flow nodes
 */
export function protoToNodes(nodes: ScriptNode[]): Node[] {
  return nodes.map((node) => {
    const data: Record<string, unknown> = {};
    if (node.data) {
      for (const [key, value] of Object.entries(node.data)) {
        data[key] = fromProtoValue(value);
      }
    }
    // Restore top-level proto fields that nodesToProto() extracts from data
    if (node.label) data.label = node.label;
    if (node.muted) data.muted = node.muted;
    if (node.collapsed) data.collapsed = node.collapsed;
    if (node.containedNodes.length > 0)
      data.containedNodes = node.containedNodes;
    if (node.parentFrameId) data.parentFrameId = node.parentFrameId;
    if (node.resolvedType !== undefined) data.resolvedType = node.resolvedType;
    return {
      id: node.id,
      type: node.type,
      position: {
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
      },
      data,
      ...(node.width != null && { width: node.width }),
      ...(node.height != null && { height: node.height }),
      // Frames must render behind other nodes
      ...(node.type === "layout.frame" && { zIndex: -1 }),
    };
  });
}

/**
 * Convert React Flow edges to proto ScriptEdges
 * Edge type is determined from the edge's type or data fields,
 * which are set when the edge is created based on port type lookup.
 */
export function edgesToProto(edges: Edge[]): ScriptEdge[] {
  return edges.map((edge) => {
    // Determine edge type from the edge's type or data
    // Port IDs are now simple names, so we rely on edge metadata
    const isExecution =
      edge.type === "execution" ||
      (edge.data as { edgeType?: string })?.edgeType === "execution";

    return create(ScriptEdgeSchema, {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? "",
      target: edge.target,
      targetHandle: edge.targetHandle ?? "",
      edgeType: isExecution ? EdgeType.EXECUTION : EdgeType.DATA,
      order: (edge.data as { order?: number } | undefined)?.order,
    });
  });
}

/**
 * Convert proto ScriptEdges to React Flow edges
 */
export function protoToEdges(edges: ScriptEdge[]): Edge[] {
  return edges.map((edge) => {
    const isExecution = edge.edgeType === EdgeType.EXECUTION;
    return {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle || undefined,
      target: edge.target,
      targetHandle: edge.targetHandle || undefined,
      type: isExecution ? "execution" : "data",
      data: {
        edgeType: isExecution ? "execution" : "data",
        ...(edge.order != null ? { order: edge.order } : {}),
      },
    };
  });
}

/**
 * Convert full ScriptData to store format
 */
export function scriptDataToStore(script: ScriptData) {
  return {
    id: script.id,
    name: script.name,
    description: script.description,
    paused: script.paused,
    quotas: script.quotas,
    nodes: protoToNodes(script.nodes),
    edges: protoToEdges(script.edges),
  };
}

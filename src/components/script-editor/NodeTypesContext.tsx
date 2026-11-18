import { useSuspenseQuery } from "@tanstack/react-query";
import type { NodeTypes } from "@xyflow/react";
import { type ReactNode, use, useCallback, useEffect, useMemo } from "react";
import { TransportContext } from "@/components/providers/transport-context";
import { nodeTypesQueryOptions } from "@/lib/script-service";
import { createNodeComponent } from "./nodes/create-node-component";
import { DebugNode } from "./nodes/DebugNode";
import { FrameNode } from "./nodes/FrameNode";
import { GroupInputNode } from "./nodes/GroupInputNode";
import { GroupNode } from "./nodes/GroupNode";
import { GroupOutputNode } from "./nodes/GroupOutputNode";
import { NoteNode } from "./nodes/NoteNode";
import {
  NodeTypesContext,
  type NodeTypesContextValue,
} from "./node-types-context.ts";
import { RerouteNode } from "./nodes/RerouteNode";
import {
  type CategoryInfo,
  initNodeDefinitions,
  initPortMetadata,
  type NodeDefinition,
  protoCategoryToLocal,
  protoNodeTypeToLocal,
} from "./nodes/types";

// Client-side layout node definitions (not from server)
// Port IDs are simple names - type is stored separately
const LAYOUT_NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: "layout.reroute",
    label: "Reroute",
    category: "layout",
    icon: "Circle",
    inputs: [{ id: "in", label: "", type: "any" }],
    outputs: [{ id: "out", label: "", type: "any" }],
    description: "A pass-through node for organizing connections",
    isLayoutNode: true,
    keywords: ["reroute", "redirect", "organize", "passthrough"],
  },
  {
    type: "layout.frame",
    label: "Frame",
    category: "layout",
    icon: "Square",
    inputs: [],
    outputs: [],
    description: "A visual container for grouping related nodes",
    isLayoutNode: true,
    keywords: ["frame", "group", "organize", "container"],
  },
  {
    type: "layout.group",
    label: "Node Group",
    category: "layout",
    icon: "Layers",
    inputs: [],
    outputs: [],
    description: "A reusable composite node containing a sub-graph",
    isLayoutNode: true,
    keywords: ["group", "subgraph", "reusable", "composite"],
  },
  {
    type: "layout.group_input",
    label: "Group Input",
    category: "layout",
    icon: "ArrowRightFromLine",
    inputs: [],
    outputs: [],
    description: "Defines inputs for a node group (inside the group)",
    isLayoutNode: true,
    keywords: ["input", "group"],
  },
  {
    type: "layout.group_output",
    label: "Group Output",
    category: "layout",
    icon: "ArrowLeftFromLine",
    inputs: [],
    outputs: [],
    description: "Defines outputs for a node group (inside the group)",
    isLayoutNode: true,
    keywords: ["output", "group"],
  },
  {
    type: "layout.debug",
    label: "Debug",
    category: "layout",
    icon: "Bug",
    inputs: [{ id: "in", label: "In", type: "any" }],
    outputs: [{ id: "out", label: "Out", type: "any" }],
    description: "Debug node for inspecting values during execution",
    isLayoutNode: true,
    keywords: ["debug", "viewer", "inspect", "watch", "log"],
  },
  {
    type: "layout.note",
    label: "Note",
    category: "layout",
    icon: "StickyNote",
    inputs: [],
    outputs: [],
    description: "A sticky note for adding comments and annotations",
    isLayoutNode: true,
    keywords: ["note", "comment", "annotation", "sticky", "text"],
  },
];

// Layout category info
const LAYOUT_CATEGORY_INFO: CategoryInfo = {
  id: "layout",
  name: "Layout",
  icon: "Layout",
  description: "Nodes for organizing your script visually",
  sortOrder: 1000, // Put at the end
};

interface NodeTypesProviderProps {
  children: ReactNode;
  includeDeprecated?: boolean;
}

export function NodeTypesProvider({
  children,
  includeDeprecated = false,
}: NodeTypesProviderProps) {
  const transport = use(TransportContext);

  const { data, isLoading } = useSuspenseQuery(
    nodeTypesQueryOptions(transport, { includeDeprecated }),
  );

  // Initialize port metadata from server response
  useEffect(() => {
    if (data.portTypeMetadata.length > 0) {
      initPortMetadata(data.portTypeMetadata);
    }
  }, [data.portTypeMetadata]);

  // Convert proto definitions to local format and add layout nodes
  const definitions = useMemo(() => {
    const result: Record<string, NodeDefinition> = {};
    // Add server-provided node types
    for (const proto of data.nodeTypes) {
      const local = protoNodeTypeToLocal(proto);
      result[local.type] = local;
    }
    // Add client-side layout node types
    for (const layoutNode of LAYOUT_NODE_DEFINITIONS) {
      result[layoutNode.type] = layoutNode;
    }
    return result;
  }, [data.nodeTypes]);

  // Initialize node definitions for port type lookup
  useEffect(() => {
    initNodeDefinitions(Object.values(definitions));
  }, [definitions]);

  // Create React Flow node types from definitions
  const nodeTypes = useMemo(() => {
    const result: NodeTypes = {};
    for (const [type, definition] of Object.entries(definitions)) {
      // Use special components for layout nodes
      if (type === "layout.reroute") {
        result[type] = RerouteNode;
      } else if (type === "layout.frame") {
        result[type] = FrameNode;
      } else if (type === "layout.group") {
        result[type] = GroupNode;
      } else if (type === "layout.group_input") {
        result[type] = GroupInputNode;
      } else if (type === "layout.group_output") {
        result[type] = GroupOutputNode;
      } else if (type === "layout.debug") {
        result[type] = DebugNode;
      } else if (type === "layout.note") {
        result[type] = NoteNode;
      } else {
        result[type] = createNodeComponent(definition);
      }
    }
    return result;
  }, [definitions]);

  // Convert and sort categories from server response, add layout category
  const categoryInfo = useMemo(() => {
    const result: Record<string, CategoryInfo> = {};
    for (const proto of data.categories) {
      const local = protoCategoryToLocal(proto);
      result[local.id] = local;
    }
    // Add layout category
    result[LAYOUT_CATEGORY_INFO.id] = LAYOUT_CATEGORY_INFO;
    return result;
  }, [data.categories]);

  // Get sorted category IDs
  const categories = useMemo(() => {
    const serverCategories = [...data.categories]
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.id);
    // Add layout category at the end
    return [...serverCategories, LAYOUT_CATEGORY_INFO.id];
  }, [data.categories]);

  // Group nodes by category
  const nodesByCategory = useMemo(() => {
    const result: Record<string, NodeDefinition[]> = {};
    for (const category of categories) {
      result[category] = [];
    }
    for (const node of Object.values(definitions)) {
      (result[node.category] ??= []).push(node);
    }
    return result;
  }, [definitions, categories]);

  const getDefinition = useCallback(
    (type: string) => definitions[type],
    [definitions],
  );

  const getNodesByCategory = useCallback(
    (category: string) => {
      return nodesByCategory[category] ?? [];
    },
    [nodesByCategory],
  );

  const getCategoryInfo = useCallback(
    (category: string): CategoryInfo => {
      return (
        categoryInfo[category] ?? {
          id: category,
          name: category,
          icon: "Circle",
          sortOrder: 999,
        }
      );
    },
    [categoryInfo],
  );

  const createNodeData = useCallback(
    (type: string, overrides?: Record<string, unknown>) => {
      const definition = definitions[type];
      if (!definition) {
        return { label: type, ...overrides };
      }
      return {
        label: definition.label,
        ...definition.defaultData,
        ...overrides,
      };
    },
    [definitions],
  );

  const value = useMemo<NodeTypesContextValue>(
    () => ({
      definitions,
      nodeTypes,
      categories,
      categoryInfo,
      getDefinition,
      getNodesByCategory,
      getCategoryInfo,
      createNodeData,
      isLoading,
    }),
    [
      definitions,
      nodeTypes,
      categories,
      categoryInfo,
      getDefinition,
      getNodesByCategory,
      getCategoryInfo,
      createNodeData,
      isLoading,
    ],
  );

  return (
    <NodeTypesContext.Provider value={value}>
      {children}
    </NodeTypesContext.Provider>
  );
}

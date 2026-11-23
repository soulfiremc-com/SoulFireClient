import { useSuspenseQuery } from "@tanstack/react-query";
import type { NodeTypes } from "@xyflow/react";
import type { TFunction } from "i18next";
import { type ReactNode, use, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TransportContext } from "@/components/providers/transport-context";
import { nodeTypesQueryOptions } from "@/lib/script-service";
import { isGroupInterfaceNode } from "@/lib/script-subgraph";
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

type LayoutNodeKey =
  | "reroute"
  | "frame"
  | "group"
  | "groupInput"
  | "groupOutput"
  | "debug"
  | "note";

// Client-side layout node definitions (not from server)
// Port IDs are simple names - type is stored separately
function layoutNodeDefinitions(t: TFunction<"instance">): NodeDefinition[] {
  const text = (key: LayoutNodeKey) => ({
    label: t(`scripts.editor.layoutNodes.${key}.label`),
    description: t(`scripts.editor.layoutNodes.${key}.description`),
  });
  return [
    {
      type: "layout.reroute",
      ...text("reroute"),
      category: "layout",
      icon: "Circle",
      inputs: [{ id: "in", label: "", type: "any" }],
      outputs: [{ id: "out", label: "", type: "any" }],
      isLayoutNode: true,
      keywords: ["reroute", "redirect", "organize", "passthrough"],
    },
    {
      type: "layout.frame",
      ...text("frame"),
      category: "layout",
      icon: "Square",
      inputs: [],
      outputs: [],
      isLayoutNode: true,
      keywords: ["frame", "group", "organize", "container"],
    },
    {
      type: "layout.group",
      ...text("group"),
      category: "layout",
      icon: "Layers",
      inputs: [],
      outputs: [],
      isLayoutNode: true,
      keywords: ["group", "subgraph", "reusable", "composite"],
    },
    {
      type: "layout.group_input",
      ...text("groupInput"),
      category: "layout",
      icon: "ArrowRightFromLine",
      inputs: [],
      outputs: [],
      isLayoutNode: true,
      keywords: ["input", "group"],
    },
    {
      type: "layout.group_output",
      ...text("groupOutput"),
      category: "layout",
      icon: "ArrowLeftFromLine",
      inputs: [],
      outputs: [],
      isLayoutNode: true,
      keywords: ["output", "group"],
    },
    {
      type: "layout.debug",
      ...text("debug"),
      category: "layout",
      icon: "Bug",
      inputs: [
        { id: "in", label: t("scripts.editor.debug.input"), type: "any" },
      ],
      outputs: [
        { id: "out", label: t("scripts.editor.debug.output"), type: "any" },
      ],
      isLayoutNode: true,
      keywords: ["debug", "viewer", "inspect", "watch", "log"],
    },
    {
      type: "layout.note",
      ...text("note"),
      category: "layout",
      icon: "StickyNote",
      inputs: [],
      outputs: [],
      isLayoutNode: true,
      keywords: ["note", "comment", "annotation", "sticky", "text"],
    },
  ];
}

const LAYOUT_CATEGORY_ID = "layout";

// Client-side components for the layout nodes
const LAYOUT_NODE_COMPONENTS: NodeTypes = {
  "layout.reroute": RerouteNode,
  "layout.frame": FrameNode,
  "layout.group": GroupNode,
  "layout.group_input": GroupInputNode,
  "layout.group_output": GroupOutputNode,
  "layout.debug": DebugNode,
  "layout.note": NoteNode,
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
  const { t } = useTranslation("instance");

  const { data, isLoading } = useSuspenseQuery(
    nodeTypesQueryOptions(transport, { includeDeprecated }),
  );

  // Initialize port metadata from server response
  useEffect(() => {
    if (data.portTypeMetadata.length > 0) {
      initPortMetadata(data.portTypeMetadata);
    }
  }, [data.portTypeMetadata]);

  // Convert proto definitions to local format
  const serverDefinitions = useMemo(
    () => data.nodeTypes.map((proto) => protoNodeTypeToLocal(proto)),
    [data.nodeTypes],
  );

  // Add the layout nodes, whose text follows the language
  const definitions = useMemo(() => {
    const result: Record<string, NodeDefinition> = {};
    for (const local of serverDefinitions) {
      result[local.type] = local;
    }
    for (const layoutNode of layoutNodeDefinitions(t)) {
      result[layoutNode.type] = layoutNode;
    }
    return result;
  }, [serverDefinitions, t]);

  // Initialize node definitions for port type lookup
  useEffect(() => {
    initNodeDefinitions(Object.values(definitions));
  }, [definitions]);

  // Create React Flow node types. They only change with the server's node
  // types, because a new component type remounts every node of that type.
  const nodeTypes = useMemo(() => {
    const result: NodeTypes = { ...LAYOUT_NODE_COMPONENTS };
    for (const definition of serverDefinitions) {
      if (definition.type in LAYOUT_NODE_COMPONENTS) continue;
      result[definition.type] = createNodeComponent(definition);
    }
    return result;
  }, [serverDefinitions]);

  // Convert and sort categories from server response, add layout category
  const categoryInfo = useMemo(() => {
    const result: Record<string, CategoryInfo> = {};
    for (const proto of data.categories) {
      const local = protoCategoryToLocal(proto);
      result[local.id] = local;
    }
    // Add layout category
    result[LAYOUT_CATEGORY_ID] = {
      id: LAYOUT_CATEGORY_ID,
      name: t("scripts.editor.layoutNodes.category.name"),
      icon: "Layout",
      description: t("scripts.editor.layoutNodes.category.description"),
      sortOrder: 1000, // Put at the end
    };
    return result;
  }, [data.categories, t]);

  // Get sorted category IDs
  const categories = useMemo(() => {
    const serverCategories = [...data.categories]
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.id);
    // Add layout category at the end
    return [...serverCategories, LAYOUT_CATEGORY_ID];
  }, [data.categories]);

  // Group nodes by category
  const nodesByCategory = useMemo(() => {
    const result: Record<string, NodeDefinition[]> = {};
    for (const category of categories) {
      result[category] = [];
    }
    for (const node of Object.values(definitions)) {
      // A group creates its own input and output node. Extra ones break it.
      if (isGroupInterfaceNode(node)) continue;
      (result[node.category] ??= []).push(node);
    }
    return result;
  }, [definitions, categories]);

  const getDefinition = useCallback(
    (type: string) => definitions[type],
    [definitions],
  );

  const getNodesByCategory = useCallback(
    (category: string) => nodesByCategory[category] ?? [],
    [nodesByCategory],
  );

  const getCategoryInfo = useCallback(
    (category: string): CategoryInfo =>
      categoryInfo[category] ?? {
        id: category,
        name: category,
        icon: "Circle",
        sortOrder: 999,
      },
    [categoryInfo],
  );

  // Leave the label unset, so the node shows its name in the viewer's
  // language until someone renames it.
  const createNodeData = useCallback(
    (type: string, overrides?: Record<string, unknown>) => ({
      ...definitions[type]?.defaultData,
      ...overrides,
    }),
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

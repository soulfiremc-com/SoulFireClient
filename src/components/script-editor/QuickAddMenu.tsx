import { useSelector } from "@tanstack/react-store";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useNodeTypes } from "./NodeTypesContext";
import { getPortTypeFromDefinition, type NodeDefinition } from "./nodes/types";

/**
 * QuickAddMenu - Blender-style quick add menu (Shift+A)
 * A searchable, categorized menu for adding nodes at the cursor position.
 */
export function QuickAddMenu() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const quickAddMenu = useSelector(editor.ui, (s) => s.quickAddMenu);
  const closeQuickAddMenu = editor.actions.closeQuickAddMenu;
  const addNode = editor.actions.addNode;
  const nodes = useSelector(editor.document, (s) => s.nodes);

  const { definitions, categories, getCategoryInfo, createNodeData } =
    useNodeTypes();

  // Focus input when menu opens
  useEffect(() => {
    if (quickAddMenu) {
      setSearch("");
      setSelectedIndex(0);
      setExpandedCategory(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [quickAddMenu]);

  // Filter nodes based on search and compatibility with source socket
  const filteredNodes = useMemo(() => {
    if (!quickAddMenu) return [];

    const sourceSocket = quickAddMenu.sourceSocket;
    let nodeDefinitions = Object.values(definitions);

    // Filter by search term
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      nodeDefinitions = nodeDefinitions.filter(
        (node) =>
          node.label.toLowerCase().includes(searchLower) ||
          node.description?.toLowerCase().includes(searchLower) ||
          node.keywords?.some((k) => k.toLowerCase().includes(searchLower)),
      );
    }

    // Filter by socket compatibility if connecting from a socket
    if (sourceSocket) {
      // Look up the source node type from the store nodes
      const sourceNode = nodes.find((n) => n.id === sourceSocket.nodeId);
      const sourceNodeType = sourceNode?.type ?? "";
      const sourceType = getPortTypeFromDefinition(
        sourceNodeType,
        sourceSocket.handleId,
      );

      if (sourceType) {
        nodeDefinitions = nodeDefinitions.filter((node) => {
          if (sourceSocket.handleType === "source") {
            // Looking for nodes with compatible inputs
            return node.inputs.some((input) => {
              const inputType = input.type;
              return (
                inputType === "any" ||
                sourceType === "any" ||
                inputType === sourceType
              );
            });
          } else {
            // Looking for nodes with compatible outputs
            return node.outputs.some((output) => {
              const outputType = output.type;
              return (
                outputType === "any" ||
                sourceType === "any" ||
                outputType === sourceType
              );
            });
          }
        });
      }
    }

    return nodeDefinitions;
  }, [quickAddMenu, definitions, search, nodes]);

  // Group filtered nodes by category
  const nodesByCategory = useMemo(() => {
    const result: Record<string, NodeDefinition[]> = {};
    for (const node of filteredNodes) {
      if (!result[node.category]) {
        result[node.category] = [];
      }
      result[node.category].push(node);
    }
    return result;
  }, [filteredNodes]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const list: {
      type: "category" | "node";
      id: string;
      node?: NodeDefinition;
    }[] = [];
    for (const category of categories) {
      const nodes = nodesByCategory[category];
      if (!nodes || nodes.length === 0) continue;

      list.push({ type: "category", id: category });
      if (expandedCategory === category || search.trim()) {
        for (const node of nodes) {
          list.push({ type: "node", id: node.type, node });
        }
      }
    }
    return list;
  }, [categories, nodesByCategory, expandedCategory, search]);

  // Handle node selection
  const selectNode = useCallback(
    (nodeDef: NodeDefinition) => {
      if (!quickAddMenu) return;

      const nodeData = createNodeData(nodeDef.type);
      addNode(nodeDef.type, quickAddMenu.position, nodeData);

      // Note: Auto-connecting from socket drag would require the new node ID
      // which we don't have here. This feature would need additional infrastructure.

      closeQuickAddMenu();
    },
    [quickAddMenu, addNode, createNodeData, closeQuickAddMenu],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          closeQuickAddMenu();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const selected = flatList[selectedIndex];
          if (selected?.type === "category") {
            setExpandedCategory(
              expandedCategory === selected.id ? null : selected.id,
            );
          } else if (selected?.node) {
            selectNode(selected.node);
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const rightItem = flatList[selectedIndex];
          if (rightItem?.type === "category") {
            setExpandedCategory(rightItem.id);
          }
          break;
        }
        case "ArrowLeft":
          e.preventDefault();
          setExpandedCategory(null);
          break;
      }
    },
    [closeQuickAddMenu, flatList, selectedIndex, expandedCategory, selectNode],
  );

  if (!quickAddMenu) return null;

  return (
    <>
      {/* Backdrop - closes menu on click, prevents native context menu on right-click */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop dismissal doesn't need keyboard */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Backdrop is not focusable */}
      <div
        className="fixed inset-0 z-50"
        onClick={closeQuickAddMenu}
        onContextMenu={(e) => {
          e.preventDefault();
          closeQuickAddMenu();
        }}
      />

      {/* Menu */}
      <div
        className={cn(
          "fixed z-50 rounded-lg border bg-popover shadow-lg",
          isMobile ? "inset-x-4 bottom-4" : "w-72",
        )}
        style={
          isMobile
            ? { maxHeight: "50vh" }
            : {
                left: quickAddMenu.screenPosition.x,
                top: quickAddMenu.screenPosition.y,
                maxHeight: "400px",
              }
        }
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label={t("scripts.editor.quickAdd.menuLabel")}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 p-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t("scripts.editor.quickAdd.searchPlaceholder")}
            className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={closeQuickAddMenu}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Node list */}
        <ScrollArea className={isMobile ? "max-h-[40vh]" : "h-[300px]"}>
          <div className="p-1">
            {flatList.length === 0 ? (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  <EmptyTitle>No nodes found</EmptyTitle>
                  <EmptyDescription>
                    Try a different search term.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              flatList.map((item, index) => {
                if (item.type === "category") {
                  const info = getCategoryInfo(item.id);
                  const isExpanded =
                    expandedCategory === item.id || search.trim();
                  return (
                    <button
                      key={`cat-${item.id}`}
                      type="button"
                      title={info.description}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium",
                        index === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() =>
                        setExpandedCategory(isExpanded ? null : item.id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="size-4" />
                      ) : (
                        <ChevronRightIcon className="size-4" />
                      )}
                      <span>{info.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {nodesByCategory[item.id]?.length ?? 0}
                      </span>
                    </button>
                  );
                } else if (item.node) {
                  return (
                    <button
                      key={`node-${item.id}`}
                      type="button"
                      title={item.node.description}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 pl-6 text-sm",
                        index === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => item.node && selectNode(item.node)}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: item.node.color ?? "#6b7280",
                        }}
                      />
                      <span>{item.node.label}</span>
                    </button>
                  );
                }
                return null;
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer hint */}
        <div className="flex items-center gap-1 border-t px-2 py-1.5 text-xs text-muted-foreground">
          <ArrowUpIcon className="size-3" />
          <ArrowDownIcon className="size-3" />
          <span>Navigate</span>
          <span className="mx-1">•</span>
          <span>Enter Select</span>
          <span className="mx-1">•</span>
          <span>Esc Close</span>
        </div>
      </div>
    </>
  );
}

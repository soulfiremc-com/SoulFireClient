import { useSelector } from "@tanstack/react-store";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useNodeTypes } from "./node-types-context";
import { canConvertType } from "./edges/connection-validation";
import {
  getPortTypeFromDefinition,
  type NodeDefinition,
  type PortDefinition,
  type PortType,
} from "./nodes/types";

// Matches the canvas rule: execution ports only pair with execution ports.
function portsFit(from: PortType, to: PortType) {
  return (
    (from === "execution") === (to === "execution") && canConvertType(from, to)
  );
}

/** Finds the first port on a new node that fits the wire the user dragged. */
function findMatchingPort(
  definition: NodeDefinition,
  socketType: PortType,
  socketSide: "source" | "target",
): PortDefinition | undefined {
  return socketSide === "source"
    ? definition.inputs.find((input) => portsFit(socketType, input.type))
    : definition.outputs.find((output) => portsFit(output.type, socketType));
}

/**
 * QuickAddMenu - Blender-style quick add menu (Shift+A)
 * A searchable, categorized menu for adding nodes at the cursor position.
 */
export function QuickAddMenu() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
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

  // Layout nodes such as reroutes keep their resolved type in their data.
  const getSocketType = useCallback(
    (socket: { nodeId: string; handleId: string }): PortType => {
      const node = nodes.find((n) => n.id === socket.nodeId);
      return (
        getPortTypeFromDefinition(node?.type ?? "", socket.handleId) ??
        (node?.data as { resolvedType?: PortType } | undefined)?.resolvedType ??
        "any"
      );
    },
    [nodes],
  );

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!quickAddMenu || !menu || isMobile) return undefined;
    const reposition = () => {
      const bounds = menu.getBoundingClientRect();
      setMenuPosition({
        left: Math.max(
          8,
          Math.min(
            quickAddMenu.screenPosition.x,
            innerWidth - bounds.width - 8,
          ),
        ),
        top: Math.max(
          8,
          Math.min(
            quickAddMenu.screenPosition.y,
            innerHeight - bounds.height - 8,
          ),
        ),
      });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(menu);
    window.addEventListener("resize", reposition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [quickAddMenu, isMobile]);

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
      const socketType = getSocketType(sourceSocket);
      nodeDefinitions = nodeDefinitions.filter(
        (node) =>
          findMatchingPort(node, socketType, sourceSocket.handleType) !==
          undefined,
      );
    }

    return nodeDefinitions;
  }, [quickAddMenu, definitions, search, getSocketType]);

  // Group filtered nodes by category
  const nodesByCategory = useMemo(() => {
    const result: Record<string, NodeDefinition[]> = {};
    for (const node of filteredNodes) {
      (result[node.category] ??= []).push(node);
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
      const categoryNodes = nodesByCategory[category];
      if (!categoryNodes || categoryNodes.length === 0) continue;

      list.push({ type: "category", id: category });
      if (expandedCategory === category || search.trim()) {
        for (const node of categoryNodes) {
          list.push({ type: "node", id: node.type, node });
        }
      }
    }
    return list;
  }, [categories, nodesByCategory, expandedCategory, search]);

  useLayoutEffect(() => {
    setSelectedIndex((index) =>
      Math.min(index, Math.max(0, flatList.length - 1)),
    );
  }, [flatList.length]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const item = selectedItemRef.current;
    if (!viewport || !item) return;
    const visible = viewport.getBoundingClientRect();
    const selected = item.getBoundingClientRect();
    if (selected.top < visible.top)
      viewport.scrollTop += selected.top - visible.top;
    else if (selected.bottom > visible.bottom)
      viewport.scrollTop += selected.bottom - visible.bottom;
  }, [selectedIndex, flatList]);

  // Handle node selection
  const selectNode = useCallback(
    (nodeDef: NodeDefinition) => {
      if (!quickAddMenu) return;

      const nodeData = createNodeData(nodeDef.type);
      const socket = quickAddMenu.sourceSocket;
      const port =
        socket &&
        findMatchingPort(nodeDef, getSocketType(socket), socket.handleType);
      // Adding the node and its wire is one undo step.
      editor.actions.beginHistoryGesture();
      const nodeId = addNode(
        nodeDef.type,
        // A node that feeds the dragged input ends at the pointer.
        socket?.handleType === "target"
          ? { ...quickAddMenu.position, x: quickAddMenu.position.x - 160 }
          : quickAddMenu.position,
        nodeData,
      );
      if (socket && port) {
        editor.actions.onConnect(
          socket.handleType === "source"
            ? {
                source: socket.nodeId,
                sourceHandle: socket.handleId,
                target: nodeId,
                targetHandle: port.id,
              }
            : {
                source: nodeId,
                sourceHandle: port.id,
                target: socket.nodeId,
                targetHandle: socket.handleId,
              },
        );
      }
      editor.actions.endHistoryGesture();
      closeQuickAddMenu();
    },
    [
      quickAddMenu,
      addNode,
      createNodeData,
      closeQuickAddMenu,
      editor,
      getSocketType,
    ],
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
          setSelectedIndex((i) =>
            Math.min(i + 1, Math.max(0, flatList.length - 1)),
          );
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
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the backdrop only catches pointer clicks; Escape closes the menu from the keyboard */}
      <div
        className="fixed inset-0 z-50"
        onClick={closeQuickAddMenu}
        onContextMenu={(e) => {
          e.preventDefault();
          closeQuickAddMenu();
        }}
      />

      {/* Menu */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the menu container handles keyboard navigation for its search field and results */}
      <div
        ref={menuRef}
        className={cn(
          "fixed z-50 flex max-w-[calc(100dvw-1rem)] flex-col overflow-hidden rounded-lg border bg-popover shadow-lg",
          isMobile ? "inset-x-4 bottom-4" : "w-72",
        )}
        style={
          isMobile
            ? { maxHeight: "min(50dvh, calc(100dvh - 2rem))" }
            : {
                left: menuPosition.left,
                top: menuPosition.top,
                maxHeight: "min(400px, calc(100dvh - 1rem))",
              }
        }
        onKeyDown={handleKeyDown}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a positioned popover menu; a native dialog element brings its own layout and focus handling
        role="dialog"
        aria-label={t("scripts.editor.quickAdd.menuLabel")}
      >
        {/* Search input */}
        <div className="flex shrink-0 items-center gap-2 p-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t("scripts.editor.quickAdd.searchPlaceholder")}
            aria-label={t("scripts.editor.quickAdd.searchPlaceholder")}
            className="h-6 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={closeQuickAddMenu}
            aria-label={t("common:uiDialog.close")}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Node list */}
        <ScrollArea
          viewportRef={viewportRef}
          className={cn("min-h-0 shrink", isMobile ? "h-[40dvh]" : "h-75")}
        >
          <div className="p-1">
            {flatList.length === 0 ? (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  <EmptyTitle>
                    {t("scripts.editor.quickAdd.noResults")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t("scripts.editor.quickAdd.noResultsDescription")}
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
                      ref={
                        index === selectedIndex ? selectedItemRef : undefined
                      }
                      key={`cat-${item.id}`}
                      type="button"
                      title={info.description}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium",
                        index === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => {
                        setExpandedCategory(isExpanded ? null : item.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="size-4" />
                      ) : (
                        <ChevronRightIcon className="size-4" />
                      )}
                      <span>{info.name}</span>
                      <span
                        className={cn(
                          "ml-auto text-xs",
                          index === selectedIndex
                            ? "text-accent-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {nodesByCategory[item.id]?.length ?? 0}
                      </span>
                    </button>
                  );
                } else if (item.node) {
                  return (
                    <button
                      ref={
                        index === selectedIndex ? selectedItemRef : undefined
                      }
                      key={`node-${item.id}`}
                      type="button"
                      title={item.node.description}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 pl-6 text-sm",
                        index === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => {
                        if (item.node) selectNode(item.node);
                      }}
                    >
                      <span
                        className="size-2 rounded-full"
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
        <div className="flex shrink-0 items-center gap-1 border-t px-2 py-1.5 text-xs text-muted-foreground">
          <ArrowUpIcon className="size-3" />
          <ArrowDownIcon className="size-3" />
          <span>{t("scripts.editor.quickAdd.navigate")}</span>
          <span className="mx-1">•</span>
          <span>{t("scripts.editor.quickAdd.select")}</span>
          <span className="mx-1">•</span>
          <span>{t("scripts.editor.quickAdd.close")}</span>
        </div>
      </div>
    </>
  );
}

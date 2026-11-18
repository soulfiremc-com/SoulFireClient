import { useSelector } from "@tanstack/react-store";
import {
  Background,
  BackgroundVariant,
  type ColorMode,
  type Connection,
  Controls,
  type Edge,
  type FinalConnectionState,
  MiniMap,
  type Node,
  ReactFlow,
  type ReactFlowInstance,
  useNodesInitialized,
  useStore,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { handleNativeCopy, handleNativePaste } from "@/lib/script-clipboard";
import { ScriptGroupViewports } from "@/lib/script-group-viewports";
import {
  ConnectionLine,
  createConnectionValidator,
  edgeTypes,
  getConnectionProblem,
} from "./edges";
import { GroupBreadcrumb } from "./GroupBreadcrumb";
import { NodeContextMenu } from "./NodeContextMenu";
import { NodeEditingProvider } from "./NodeEditingContext";
import { useNodeTypes } from "./node-types-context";
import { getNodeDefinition, isPortMultiInput } from "./nodes/types";
import { QuickAddMenu } from "./QuickAddMenu";
import { ScriptFirstUse } from "./ScriptFirstUse";

/**
 * Canvas shortcuts skip text fields, menus, and dialogs. React also bubbles
 * events from portaled menus through this tree, so the target must be in the
 * canvas DOM.
 */
function isCanvasShortcutTarget(container: Element, target: EventTarget) {
  if (!(target instanceof HTMLElement) || !container.contains(target))
    return false;
  return (
    !target.isContentEditable &&
    !target.closest(
      "input, textarea, select, [role='dialog'], [role='menu'], [role='listbox']",
    )
  );
}

/**
 * Picks the canvas color mode from the theme on the page. A forced theme wins,
 * because next-themes keeps reporting the stored theme as resolvedTheme. Before
 * the theme resolves, follow the theme class already on the page, so the
 * canvas never mixes dark node colors with light text.
 */
function canvasColorMode(resolvedTheme: string | undefined): ColorMode {
  if (resolvedTheme === "light" || resolvedTheme === "dark") {
    return resolvedTheme;
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ScriptEditor() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const { resolvedTheme, forcedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const nodesInitialized = useNodesInitialized();
  // The 200x150 overview needs room beside the graph and its navigation controls.
  const showMiniMap = useStore(
    (state) => state.width >= 640 && state.height >= 400,
  );
  const [groupViewports] = useState(() => new ScriptGroupViewports());
  const {
    contextMenu: nodeContextMenu,
    handleContextMenu: openNodeContextMenu,
    dismiss: dismissNodeContextMenu,
    menuRef: nodeMenuRef,
  } = useContextMenu<string>();
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const { nodeTypes } = useNodeTypes();

  const nodes = useSelector(editor.document, (state) => state.nodes);
  const _edges = useSelector(editor.document, (state) => state.edges);
  const onNodesChange = editor.actions.onNodesChange;
  const onEdgesChange = editor.actions.onEdgesChange;
  const onConnect = editor.actions.onConnect;
  const storeOnReconnect = editor.actions.onReconnect;
  const updateNodeData = editor.actions.updateNodeData;
  const setSelectedNode = editor.actions.setSelectedNode;
  const deleteSelected = editor.actions.deleteSelected;

  // Blender-style actions
  const toggleMute = editor.actions.toggleMute;
  const toggleCollapse = editor.actions.toggleCollapse;
  const toggleSocketVisibility = editor.actions.toggleSocketVisibility;
  const togglePreview = editor.actions.togglePreview;
  const createFrame = editor.actions.createFrame;
  const duplicateSelected = editor.actions.duplicateSelected;
  const openQuickAddMenu = editor.actions.openQuickAddMenu;
  const selectedNodeId = useSelector(
    editor.ui,
    (state) => state.selectedNodeId,
  );

  // Group actions
  const groupEditStack = useSelector(
    editor.ui,
    (state) => state.groupEditStack,
  );
  const currentGroupId = groupEditStack[groupEditStack.length - 1] ?? null;
  const canvasRevision = useSelector(
    editor.ui,
    (state) => state.canvasRevision,
  );
  const visibleNodes = useSelector(editor.visibleNodes);
  const visibleEdges = useSelector(editor.visibleEdges);
  const enterGroup = editor.actions.enterGroup;
  const exitGroup = editor.actions.exitGroup;
  const createGroupFromSelection = editor.actions.createGroupFromSelection;
  const ungroupSelected = editor.actions.ungroupSelected;

  // Reroute action
  const insertReroute = editor.actions.insertReroute;

  // Selection actions
  const selectAll = editor.actions.selectAll;
  const selectLinked = editor.actions.selectLinked;
  const selectSimilar = editor.actions.selectSimilar;
  const selectShortestPath = editor.actions.selectShortestPath;

  // Clipboard actions
  const getSelectedForClipboard = editor.actions.getSelectedForClipboard;
  const pasteClipboardData = editor.actions.pasteClipboardData;

  // Alignment actions
  const alignNodes = editor.actions.alignNodes;
  const distributeNodes = editor.actions.distributeNodes;

  // Link cutting
  const linkCutting = useSelector(editor.ui, (state) => state.linkCutting);
  const startLinkCutting = editor.actions.startLinkCutting;
  const updateLinkCutting = editor.actions.updateLinkCutting;
  const endLinkCutting = editor.actions.endLinkCutting;

  // Node context menu actions
  const disconnectNode = editor.actions.disconnectNode;
  const previewEnabledNodes = useSelector(
    editor.ui,
    (state) => state.previewEnabledNodes,
  );

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

  // Keep the first fit behind measurement; later fits are queued for the new group's nodes.
  useEffect(() => {
    if (
      !reactFlowInstance ||
      (!nodesInitialized && !groupViewports.isInitialized(canvasRevision))
    )
      return;
    const navigating = groupViewports.isInitialized(canvasRevision);
    const change = groupViewports.enter(
      currentGroupId,
      reactFlowInstance.getViewport(),
      canvasRevision,
    );
    if (change.type === "unchanged") return;
    if (navigating) containerRef.current?.focus({ preventScroll: true });
    if (change.type === "restore") {
      void reactFlowInstance.setViewport(change.viewport);
    } else if (change.type === "fit") {
      const fitted = visibleNodes.length
        ? reactFlowInstance.fitView({
            nodes: visibleNodes.map(({ id }) => ({ id })),
            // A lone first node should not fill the whole canvas.
            maxZoom: 1,
          })
        : reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
      void fitted.then((success) => {
        if (success) groupViewports.completeFit(currentGroupId, canvasRevision);
      });
    }
  }, [
    canvasRevision,
    currentGroupId,
    groupViewports,
    nodesInitialized,
    reactFlowInstance,
    visibleNodes,
  ]);

  const getCanvasCenter = useCallback(() => {
    if (!reactFlowInstance || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const screenPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    return {
      screenPosition,
      flowPosition: reactFlowInstance.screenToFlowPosition(screenPosition),
    };
  }, [reactFlowInstance]);

  // Auto-focus the container so keyboard shortcuts work immediately
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Array<{ id: string }> }) => {
      if (selectedNodes.length === 1) {
        setSelectedNode(selectedNodes[0].id);
      } else {
        setSelectedNode(null);
      }
    },
    [setSelectedNode],
  );

  // Handle Shift+click for shortest path selection (Blender-style)
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      if (event.shiftKey) {
        // Find the currently selected node (if any)
        const currentlySelected = nodes.find((n) => n.selected);
        if (currentlySelected && currentlySelected.id !== node.id) {
          event.preventDefault();
          selectShortestPath(currentlySelected.id, node.id);
        }
      }
    },
    [nodes, selectShortestPath],
  );

  // Double-click on a group node to enter it
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "layout.group") {
        enterGroup(node.id);
      }
    },
    [enterGroup],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isCanvasShortcutTarget(event.currentTarget, event.target)) return;

      const selectedNodes = nodes.filter((n) => n.selected);
      const commandKey = event.ctrlKey || event.metaKey;

      // Ctrl+Z - Undo, Ctrl+Shift+Z or Ctrl+Y - Redo
      if (commandKey && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.actions.redo();
        else editor.actions.undo();
        return;
      }
      if (
        commandKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        editor.actions.redo();
        return;
      }

      // A - Select all nodes (Blender-style, no modifier)
      if (
        event.key === "a" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        selectAll();
        return;
      }

      // Alt+A - Deselect all nodes
      if (
        (event.key === "a" || event.key === "A") &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        onNodesChange(
          nodes
            .filter((n) => n.selected)
            .map((n) => ({
              type: "select" as const,
              id: n.id,
              selected: false,
            })),
        );
        return;
      }

      // Delete/Backspace/X - Delete selected
      if (
        event.key === "Delete" ||
        event.key === "Backspace" ||
        event.key === "x"
      ) {
        if (
          event.key === "x" &&
          (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        ) {
          return;
        }
        deleteSelected();
        return;
      }

      // F2 - Rename selected node
      if (event.key === "F2") {
        event.preventDefault();
        if (selectedNodeId) {
          setRenamingNodeId(selectedNodeId);
        }
        return;
      }

      // Tab - Enter/Exit group
      if (event.key === "Tab") {
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
          return;
        if (groupEditStack.length > 0) {
          event.preventDefault();
          // If inside a group, exit
          exitGroup();
        } else if (selectedNodeId) {
          // If a group node is selected, enter it
          const selectedNode = nodes.find((n) => n.id === selectedNodeId);
          if (selectedNode?.type === "layout.group") {
            event.preventDefault();
            enterGroup(selectedNodeId);
          }
        }
        return;
      }

      // Shift+A - Quick add menu
      if (
        event.key === "A" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        const center = getCanvasCenter();
        if (center) {
          openQuickAddMenu(center.flowPosition, center.screenPosition);
        }
        return;
      }

      // M - Toggle mute on selected node
      if (
        event.key === "m" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (
          selected &&
          getNodeDefinition(selected.type ?? "")?.supportsMuting
        ) {
          toggleMute(selected.id);
        }
        return;
      }

      // H - Toggle collapse on selected node (without modifiers)
      if (
        event.key === "h" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        if (selectedNodeId) {
          toggleCollapse(selectedNodeId);
        }
        return;
      }

      // Ctrl+H - Toggle socket visibility (hide unconnected)
      if (
        event.key === "h" &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (selectedNodeId) {
          toggleSocketVisibility(selectedNodeId);
        }
        return;
      }

      // Shift+H - Toggle preview on selected node
      if (
        (event.key === "H" || event.key === "h") &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        if (selectedNodeId) {
          togglePreview(selectedNodeId);
        }
        return;
      }

      // Ctrl+G - Create group from selected nodes
      if (
        event.key === "g" &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (selectedNodes.length > 0) {
          createGroupFromSelection();
        }
        return;
      }

      // Ctrl+Alt+G - Ungroup selected group node (Blender convention)
      if (
        (event.key === "g" || event.key === "G") &&
        (event.ctrlKey || event.metaKey) &&
        event.altKey
      ) {
        event.preventDefault();
        ungroupSelected();
        return;
      }

      // Ctrl+J - Create frame around selected nodes
      if (
        (event.key === "j" || event.key === "J") &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        if (selectedNodes.length > 0) {
          createFrame(selectedNodes.map((n) => n.id));
        }
        return;
      }

      // Shift+D - Duplicate selected (Blender-style)
      if (
        event.key === "D" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      // Note: Ctrl+C and Ctrl+V are handled via native onCopy/onPaste events
      // to avoid Firefox's clipboard permission prompts

      // L - Select linked (both directions, Blender-style)
      if (
        event.key === "l" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        selectLinked("both");
        return;
      }

      // Ctrl+L / Cmd+L - Select upstream only
      if (
        (event.key === "l" || event.key === "L") &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        selectLinked("upstream");
        return;
      }

      // Alt+L / ⌥L - Select downstream only
      if (
        (event.key === "l" || event.key === "L") &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        selectLinked("downstream");
        return;
      }

      // Shift+S - Select similar (same node type)
      if (
        event.key === "S" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        selectSimilar();
        return;
      }

      // Alignment shortcuts (Ctrl+Shift+Arrow / Cmd+Shift+Arrow)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        selectedNodes.length >= 2
      ) {
        switch (event.key) {
          case "ArrowLeft":
            event.preventDefault();
            alignNodes("left");
            return;
          case "ArrowRight":
            event.preventDefault();
            alignNodes("right");
            return;
          case "ArrowUp":
            event.preventDefault();
            alignNodes("top");
            return;
          case "ArrowDown":
            event.preventDefault();
            alignNodes("bottom");
            return;
        }
      }

      // Distribute shortcuts
      if (event.altKey && event.shiftKey && selectedNodes.length >= 3) {
        if (event.key === "H" || event.key === "h") {
          event.preventDefault();
          distributeNodes("horizontal");
          return;
        }
        if (event.key === "V" || event.key === "v") {
          event.preventDefault();
          distributeNodes("vertical");
          return;
        }
      }
    },
    [
      editor,
      nodes,
      onNodesChange,
      deleteSelected,
      getCanvasCenter,
      openQuickAddMenu,
      selectedNodeId,
      toggleMute,
      toggleCollapse,
      toggleSocketVisibility,
      togglePreview,
      createFrame,
      createGroupFromSelection,
      ungroupSelected,
      duplicateSelected,
      groupEditStack,
      enterGroup,
      exitGroup,
      selectAll,
      selectLinked,
      selectSimilar,
      alignNodes,
      distributeNodes,
    ],
  );

  // Native copy handler - uses ClipboardEvent for cross-browser support without permission prompts
  const handleCopy = useCallback(
    (event: React.ClipboardEvent) => {
      if (!isCanvasShortcutTarget(event.currentTarget, event.target)) return;

      const clipboardData = getSelectedForClipboard();
      if (clipboardData) {
        handleNativeCopy(event.nativeEvent, clipboardData);
      }
    },
    [getSelectedForClipboard],
  );

  // Native paste handler - uses ClipboardEvent for cross-browser support without permission prompts
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (!isCanvasShortcutTarget(event.currentTarget, event.target)) return;

      const clipboardData = handleNativePaste(event.nativeEvent);
      const center = getCanvasCenter();
      if (clipboardData && center) {
        pasteClipboardData(clipboardData, center.flowPosition);
      }
    },
    [getCanvasCenter, pasteClipboardData],
  );

  // Handle right-click on canvas for quick add menu
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) return;

      const flowPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Regular RMB = quick add menu
      openQuickAddMenu(flowPosition, { x: event.clientX, y: event.clientY });
    },
    [reactFlowInstance, openQuickAddMenu],
  );

  // Handle right-click on edge for quick reroute (Shift+RMB)
  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (!reactFlowInstance) return;

      // Shift+RMB on an edge = quick reroute
      if (event.shiftKey) {
        event.preventDefault();
        const flowPosition = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        insertReroute(edge.id, flowPosition);
      }
      // Without shift, let the default context menu appear (or could add edge-specific menu later)
    },
    [reactFlowInstance, insertReroute],
  );

  // Handle right-click on node (React Flow idiomatic pattern)
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Select the right-clicked node if it isn't already selected
      if (!node.selected) {
        onNodesChange([
          // Deselect all other nodes
          ...nodes
            .filter((n) => n.selected && n.id !== node.id)
            .map((n) => ({
              type: "select" as const,
              id: n.id,
              selected: false,
            })),
          // Select the right-clicked node
          { type: "select" as const, id: node.id, selected: true },
        ]);
      }

      openNodeContextMenu(event, node.id);
    },
    [nodes, onNodesChange, openNodeContextMenu],
  );

  // Close node context menu on pane click
  const handlePaneClick = useCallback(() => {
    dismissNodeContextMenu();
    containerRef.current?.focus({ preventScroll: true });
  }, [dismissNodeContextMenu]);

  // Handle pointer down for link cutting (Alt+drag)
  // Uses pointer events instead of mouse events to support touch/stylus
  // Note: React Flow doesn't provide onPanePointerDown, so we use the wrapper div
  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.altKey && event.button === 0 && reactFlowInstance) {
        event.preventDefault();
        const flowPosition = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        startLinkCutting(flowPosition);
      }
    },
    [reactFlowInstance, startLinkCutting],
  );

  // Handle pointer move for link cutting
  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (linkCutting.active && reactFlowInstance) {
        const flowPosition = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        updateLinkCutting(flowPosition);
      }
    },
    [linkCutting.active, reactFlowInstance, updateLinkCutting],
  );

  // Handle pointer up for link cutting
  const handlePointerUp = useCallback(() => {
    if (linkCutting.active) {
      endLinkCutting();
    }
  }, [linkCutting.active, endLinkCutting]);

  // Create connection validator with current nodes
  const connectionValidator = useMemo(
    () => createConnectionValidator(visibleNodes),
    [visibleNodes],
  );

  // Edge reconnection: drag an edge to move it, drop on empty to delete
  const edgeReconnectSuccessful = useRef(true);

  const handleReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
    editor.actions.beginHistoryGesture();
  }, [editor]);

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      storeOnReconnect(oldEdge, newConnection);
    },
    [storeOnReconnect],
  );

  const handleReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        // Dropped on empty space: delete the edge
        onEdgesChange([{ id: edge.id, type: "remove" }]);
      }
      edgeReconnectSuccessful.current = true;
      editor.actions.endHistoryGesture();
    },
    [editor, onEdgesChange],
  );

  // Handle-based reconnection: dragging from an occupied single input
  // detaches the existing edge so the user can reconnect it elsewhere. If
  // dropped on empty space the original edge is restored.
  const detachedEdgeRef = useRef<{ edge: Edge; index: number } | null>(null);
  const connectionMadeRef = useRef(false);

  const handleConnectStart = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      params: {
        nodeId: string | null;
        handleId: string | null;
        handleType: string | null;
      },
    ) => {
      connectionMadeRef.current = false;
      detachedEdgeRef.current = null;
      // Detaching and reconnecting is one undo step.
      editor.actions.beginHistoryGesture();

      if (params.handleType === "target" && params.nodeId && params.handleId) {
        const { edges: currentEdges, nodes: currentNodes } =
          editor.document.get();
        const nodeType =
          currentNodes.find((node) => node.id === params.nodeId)?.type ?? "";
        // Multi-input ports keep their wires, so a drag adds another one.
        if (isPortMultiInput(nodeType, params.handleId)) return;
        const existing = currentEdges.filter(
          (e) =>
            e.target === params.nodeId && e.targetHandle === params.handleId,
        );
        if (existing.length === 1) {
          detachedEdgeRef.current = {
            edge: existing[0],
            index: currentEdges.indexOf(existing[0]),
          };
          onEdgesChange([{ id: existing[0].id, type: "remove" }]);
        }
      }
    },
    [onEdgesChange, editor],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      connectionMadeRef.current = true;
      detachedEdgeRef.current = null;
      onConnect(connection);
    },
    [onConnect],
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const detached = detachedEdgeRef.current;
      const connected = connectionMadeRef.current;
      if (detached && !connected) {
        // Restore the detached edge in place since no new connection was made
        editor.document.setState((current) => {
          const edges = [...current.edges];
          edges.splice(detached.index, 0, detached.edge);
          return { ...current, edges };
        });
      }
      detachedEdgeRef.current = null;
      connectionMadeRef.current = false;
      editor.actions.endHistoryGesture();
      if (connected || detached || !state.fromHandle) return;

      const from = state.fromHandle;
      const to = state.toHandle;
      if (to && to.type !== from.type) {
        // Dropped on a port that does not fit. Say why.
        const connection =
          from.type === "source"
            ? {
                source: from.nodeId,
                sourceHandle: from.id ?? null,
                target: to.nodeId,
                targetHandle: to.id ?? null,
              }
            : {
                source: to.nodeId,
                sourceHandle: to.id ?? null,
                target: from.nodeId,
                targetHandle: from.id ?? null,
              };
        const problem = getConnectionProblem(
          editor.document.get().nodes,
          connection,
        );
        if (problem?.kind === "self") {
          toast.info(t("scripts.editor.connection.self"));
        } else if (problem?.kind === "execution") {
          toast.info(t("scripts.editor.connection.execution"));
        } else if (problem) {
          toast.info(
            t("scripts.editor.connection.type", {
              source: problem.sourceType,
              target: problem.targetType,
            }),
          );
        }
        return;
      }

      // Dropped on empty canvas: offer the nodes that fit this port.
      if (!state.toNode && reactFlowInstance) {
        const point =
          "changedTouches" in event ? event.changedTouches[0] : event;
        if (!point) return;
        const screenPosition = { x: point.clientX, y: point.clientY };
        openQuickAddMenu(
          reactFlowInstance.screenToFlowPosition(screenPosition),
          screenPosition,
          {
            nodeId: from.nodeId,
            handleId: from.id ?? "",
            handleType: from.type,
          },
        );
      }
    },
    [editor, openQuickAddMenu, reactFlowInstance, t],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full outline-none"
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <NodeEditingProvider
        edges={visibleEdges}
        updateNodeData={updateNodeData}
        renamingNodeId={renamingNodeId}
        clearRenamingNodeId={() => setRenamingNodeId(null)}
      >
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnectStart={handleConnectStart}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          onInit={handleInit}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onSelectionChange={handleSelectionChange}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
          onPaneClick={handlePaneClick}
          isValidConnection={connectionValidator}
          connectionLineComponent={ConnectionLine}
          edgesReconnectable
          onReconnectStart={handleReconnectStart}
          onReconnect={handleReconnect}
          onReconnectEnd={handleReconnectEnd}
          colorMode={canvasColorMode(forcedTheme ?? resolvedTheme)}
          minZoom={0.1}
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--muted-foreground)"
          />
          <Controls />
          {showMiniMap && <MiniMap zoomable pannable />}
          {groupEditStack.length === 0 && <ScriptFirstUse />}
        </ReactFlow>
      </NodeEditingProvider>

      {/* Group breadcrumb navigation */}
      <GroupBreadcrumb />

      <QuickAddMenu />

      {nodeContextMenu &&
        (() => {
          const menuNode = visibleNodes.find(
            (n) => n.id === nodeContextMenu.data,
          );
          const menuDefinition = getNodeDefinition(menuNode?.type ?? "");
          const menuData = menuNode?.data as
            | { muted?: boolean; collapsed?: boolean }
            | undefined;
          return (
            <ContextMenuPortal
              x={nodeContextMenu.position.x}
              y={nodeContextMenu.position.y}
              menuRef={nodeMenuRef}
              onClose={dismissNodeContextMenu}
            >
              <NodeContextMenu
                nodeId={nodeContextMenu.data}
                isMuted={menuData?.muted ?? false}
                isCollapsed={menuData?.collapsed ?? false}
                isGroup={menuNode?.type === "layout.group"}
                supportsMuting={menuDefinition?.supportsMuting ?? false}
                supportsPreview={menuDefinition?.supportsPreview ?? false}
                previewEnabled={previewEnabledNodes.has(nodeContextMenu.data)}
                onRename={setRenamingNodeId}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
                onDisconnectAll={disconnectNode}
                onToggleMute={toggleMute}
                onToggleCollapse={toggleCollapse}
                onTogglePreview={togglePreview}
                onOpenGroup={enterGroup}
                onUngroup={(nodeId) => {
                  setSelectedNode(nodeId);
                  ungroupSelected();
                }}
              />
            </ContextMenuPortal>
          );
        })()}

      {/* Link cutting visual indicator */}
      {linkCutting.active &&
        linkCutting.startPoint &&
        linkCutting.endPoint &&
        reactFlowInstance && (
          <svg
            className="pointer-events-none absolute inset-0 z-50"
            style={{ overflow: "visible" }}
            aria-hidden="true"
          >
            <title>Link cutting line</title>
            <line
              x1={
                reactFlowInstance.flowToScreenPosition(linkCutting.startPoint)
                  .x - (containerRef.current?.getBoundingClientRect().left ?? 0)
              }
              y1={
                reactFlowInstance.flowToScreenPosition(linkCutting.startPoint)
                  .y - (containerRef.current?.getBoundingClientRect().top ?? 0)
              }
              x2={
                reactFlowInstance.flowToScreenPosition(linkCutting.endPoint).x -
                (containerRef.current?.getBoundingClientRect().left ?? 0)
              }
              y2={
                reactFlowInstance.flowToScreenPosition(linkCutting.endPoint).y -
                (containerRef.current?.getBoundingClientRect().top ?? 0)
              }
              stroke="var(--destructive)"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          </svg>
        )}
    </div>
  );
}

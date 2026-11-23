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
import { isSingleWireInput } from "@/lib/script-graph-ops";
import { ScriptGroupViewports } from "@/lib/script-group-viewports";
import { ConnectionLine } from "./edges/ConnectionLine";
import {
  createConnectionValidator,
  getConnectionProblem,
} from "./edges/connection-validation";
import { edgeTypes } from "./edges/edge-types";
import { GroupBreadcrumb } from "./GroupBreadcrumb";
import { NodeContextMenu } from "./NodeContextMenu";
import { NodeEditingProvider } from "./NodeEditingContext";
import { useNodeTypes } from "./node-types-context";
import { getNodeDefinition } from "./nodes/types";
import { type CanvasShortcutId, matchCanvasShortcut } from "./canvas-shortcuts";
import { readDrawnEdgeShapes } from "./drawn-edge-shapes";
import { QuickAddMenu } from "./QuickAddMenu";
import { ScriptFirstUse } from "./ScriptFirstUse";

/**
 * Canvas shortcuts skip fields and controls inside nodes, menus, and dialogs.
 * The canvas listens in the capture phase, so it sees these keys before the
 * controls do. React also bubbles events from portaled menus through this
 * tree, so the target must be in the canvas DOM.
 */
function isCanvasShortcutTarget(container: Element, target: EventTarget) {
  if (!(target instanceof HTMLElement) || !container.contains(target))
    return false;
  return (
    !target.isContentEditable &&
    !target.closest(
      "input, textarea, select, button, [role='checkbox'], [role='combobox'], [role='dialog'], [role='menu'], [role='listbox']",
    )
  );
}

/** How long a touch or pen press on a node waits before it opens the menu. */
const LONG_PRESS_MS = 500;
/** Moving further than this turns a long press into a drag. */
const LONG_PRESS_TOLERANCE_PX = 8;

const ALIGN_BY_KEY: Partial<
  Record<string, "left" | "right" | "top" | "bottom">
> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "top",
  ArrowDown: "bottom",
};

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
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [groupViewports] = useState(() => new ScriptGroupViewports());
  const {
    contextMenu: nodeContextMenu,
    handleContextMenu: openNodeContextMenu,
    dismiss: dismissNodeContextMenu,
    menuRef: nodeMenuRef,
  } = useContextMenu<string>();
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const { nodeTypes } = useNodeTypes();

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
  const togglePreview = editor.actions.togglePreview;
  const duplicateSelected = editor.actions.duplicateSelected;
  const openQuickAddMenu = editor.actions.openQuickAddMenu;

  // Group actions
  const groupEditStack = useSelector(
    editor.ui,
    (state) => state.groupEditStack,
  );
  const currentGroupId = groupEditStack.at(-1) ?? null;
  const canvasRevision = useSelector(
    editor.ui,
    (state) => state.canvasRevision,
  );
  const visibleNodes = useSelector(editor.visibleNodes);
  const visibleEdges = useSelector(editor.visibleEdges);
  const enterGroup = editor.actions.enterGroup;
  const ungroupSelected = editor.actions.ungroupSelected;

  // Reroute action
  const insertReroute = editor.actions.insertReroute;

  // Clipboard actions
  const getSelectedForClipboard = editor.actions.getSelectedForClipboard;
  const pasteClipboardData = editor.actions.pasteClipboardData;

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

  const clearRenamingNodeId = useCallback(() => {
    setRenamingNodeId(null);
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
    } else {
      const fitted =
        visibleNodes.length > 0
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
    ({ nodes: selectedNodes }: { nodes: { id: string }[] }) => {
      const [selected] = selectedNodes;
      if (selectedNodes.length === 1 && selected) {
        setSelectedNode(selected.id);
      } else {
        setSelectedNode(null);
      }
    },
    [setSelectedNode],
  );

  // React Flow selects the clicked node on pointer down, before the click
  // event. Remember the node that was selected before that for Shift+click.
  const shiftClickAnchorRef = useRef<string | null>(null);

  // Handle Shift+click for shortest path selection (Blender-style)
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      const anchor = shiftClickAnchorRef.current;
      shiftClickAnchorRef.current = null;
      if (event.shiftKey && anchor && anchor !== node.id) {
        event.preventDefault();
        editor.actions.selectShortestPath(anchor, node.id);
      }
    },
    [editor],
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

  /** Runs a canvas shortcut. Returns false when it does not apply here. */
  const runShortcut = useCallback(
    (
      id: CanvasShortcutId,
      key: string,
      container: Element,
      target: EventTarget,
    ): boolean => {
      // Read the graph on demand so dragging does not re-render the canvas.
      const { nodes } = editor.document.get();
      const { selectedNodeId, groupEditStack: stack } = editor.ui.get();
      const selectedNodes = nodes.filter((n) => n.selected);
      const selected = nodes.find((n) => n.id === selectedNodeId);
      const { actions } = editor;
      switch (id) {
        case "undo": {
          actions.undo();
          return true;
        }
        case "redo": {
          actions.redo();
          return true;
        }
        case "selectAll": {
          actions.selectAll();
          return true;
        }
        case "deselectAll": {
          actions.onNodesChange(
            selectedNodes.map((n) => ({
              type: "select" as const,
              id: n.id,
              selected: false,
            })),
          );
          return true;
        }
        case "delete": {
          actions.deleteSelected();
          return true;
        }
        case "rename": {
          if (selectedNodeId) setRenamingNodeId(selectedNodeId);
          return true;
        }
        case "enterGroup": {
          // Tab only opens or leaves a group from the canvas itself or a
          // focused group node. Anywhere else it moves focus as usual.
          const focusedNode =
            target instanceof HTMLElement &&
            target.classList.contains("react-flow__node")
              ? nodes.find((n) => n.id === target.dataset["id"])
              : undefined;
          if (focusedNode?.type === "layout.group") {
            actions.enterGroup(focusedNode.id);
            return true;
          }
          if (target !== container) return false;
          if (stack.length > 0) {
            actions.exitGroup();
            return true;
          }
          if (selected?.type === "layout.group") {
            actions.enterGroup(selected.id);
            return true;
          }
          return false;
        }
        case "quickAdd": {
          const center = getCanvasCenter();
          if (center) {
            actions.openQuickAddMenu(
              center.flowPosition,
              center.screenPosition,
            );
          }
          return true;
        }
        case "mute": {
          if (
            selected &&
            getNodeDefinition(selected.type ?? "")?.supportsMuting
          ) {
            actions.toggleMute(selected.id);
          }
          return true;
        }
        case "collapse": {
          if (selectedNodeId) actions.toggleCollapse(selectedNodeId);
          return true;
        }
        case "hideSockets": {
          if (selectedNodeId) actions.toggleSocketVisibility(selectedNodeId);
          return true;
        }
        case "preview": {
          if (selectedNodeId) actions.togglePreview(selectedNodeId);
          return true;
        }
        case "group": {
          if (selectedNodes.length > 0) actions.createGroupFromSelection();
          return true;
        }
        case "ungroup": {
          actions.ungroupSelected();
          return true;
        }
        case "frame": {
          if (selectedNodes.length > 0) {
            actions.createFrame(selectedNodes.map((n) => n.id));
          }
          return true;
        }
        case "duplicate": {
          actions.duplicateSelected();
          return true;
        }
        case "selectLinked": {
          actions.selectLinked("both");
          return true;
        }
        case "selectUpstream": {
          actions.selectLinked("upstream");
          return true;
        }
        case "selectDownstream": {
          actions.selectLinked("downstream");
          return true;
        }
        case "selectSimilar": {
          actions.selectSimilar();
          return true;
        }
        case "align": {
          const alignment = ALIGN_BY_KEY[key];
          if (alignment && selectedNodes.length >= 2) {
            actions.alignNodes(alignment);
          }
          return true;
        }
        case "distribute": {
          if (selectedNodes.length >= 3) {
            actions.distributeNodes(key === "v" ? "vertical" : "horizontal");
          }
          return true;
        }
        // Handled by copy and paste events or pointer gestures.
        case "copy":
        case "paste":
        case "quickAddAtCursor":
        case "cutLinks":
        case "reroute": {
          return false;
        }
      }
      return false;
    },
    [editor, getCanvasCenter],
  );

  // Runs in the capture phase, before React Flow's own node key handling.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Escape - Stop a link cut without cutting
      if (event.key === "Escape" && editor.ui.get().linkCutting.active) {
        event.preventDefault();
        event.stopPropagation();
        editor.actions.cancelLinkCutting();
        return;
      }
      if (!isCanvasShortcutTarget(event.currentTarget, event.target)) return;
      const shortcut = matchCanvasShortcut(event);
      if (!shortcut) return;
      if (
        shortcut.ignoredRepeat ||
        runShortcut(
          shortcut.id,
          shortcut.key,
          event.currentTarget,
          event.target,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [editor, runShortcut],
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

  // Selects the node, unless it is already part of the selection, and opens
  // its menu at the pointer.
  const openNodeMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, nodeId: string) => {
      const { nodes } = editor.document.get();
      if (!nodes.find((n) => n.id === nodeId)?.selected) {
        onNodesChange([
          ...nodes
            .filter((n) => n.selected && n.id !== nodeId)
            .map((n) => ({
              type: "select" as const,
              id: n.id,
              selected: false,
            })),
          { type: "select" as const, id: nodeId, selected: true },
        ]);
      }
      openNodeContextMenu(event, nodeId);
    },
    [editor, onNodesChange, openNodeContextMenu],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      openNodeMenu(event, node.id);
    },
    [openNodeMenu],
  );

  // iOS fires no contextmenu event, so a long press on a node opens its menu.
  const longPressRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }, []);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      const nodeElement =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".react-flow__node")
          : null;
      shiftClickAnchorRef.current =
        event.shiftKey && nodeElement ? editor.ui.get().selectedNodeId : null;

      cancelLongPress();
      const nodeId = nodeElement?.dataset["id"];
      if (event.pointerType === "mouse" || !event.isPrimary || !nodeId) return;
      const { clientX, clientY, pointerId } = event;
      longPressRef.current = {
        pointerId,
        x: clientX,
        y: clientY,
        timer: setTimeout(() => {
          longPressRef.current = null;
          openNodeMenu(
            new MouseEvent("contextmenu", { clientX, clientY }),
            nodeId,
          );
        }, LONG_PRESS_MS),
      };
    },
    [editor, cancelLongPress, openNodeMenu],
  );

  const handlePointerMoveCapture = useCallback(
    (event: React.PointerEvent) => {
      const press = longPressRef.current;
      if (
        press?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
          LONG_PRESS_TOLERANCE_PX
      ) {
        cancelLongPress();
      }
    },
    [cancelLongPress],
  );

  const focusCanvas = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  // Close node context menu on pane click
  const handlePaneClick = useCallback(() => {
    dismissNodeContextMenu();
    focusCanvas();
  }, [dismissNodeContextMenu, focusCanvas]);

  // Handle pointer down for link cutting (Alt+drag)
  // Uses pointer events instead of mouse events to support touch/stylus
  // Note: React Flow doesn't provide onPanePointerDown, so we use the wrapper div
  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.altKey && event.button === 0 && reactFlowInstance) {
        event.preventDefault();
        // Keep receiving the release when the pointer leaves the canvas.
        event.currentTarget.setPointerCapture(event.pointerId);
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
  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      // Cut before releasing capture, so the lost capture event finds no cut.
      if (linkCutting.active) {
        endLinkCutting(readDrawnEdgeShapes(containerRef.current));
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [linkCutting.active, endLinkCutting],
  );

  // The system took the pointer, for example on a window switch. Without a
  // release there is no line to cut along.
  const cancelLinkCutting = editor.actions.cancelLinkCutting;

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
  const detachedEdgeRef = useRef<{
    edge: Edge;
    index: number;
    wasDirty: boolean;
  } | null>(null);
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
        const {
          edges: currentEdges,
          nodes: currentNodes,
          isDirty,
        } = editor.document.get();
        // Multi-input and execution ports keep their wires, so a drag adds
        // another one.
        if (!isSingleWireInput(currentNodes, params.nodeId, params.handleId))
          return;
        const existing = currentEdges.filter(
          (e) =>
            e.target === params.nodeId && e.targetHandle === params.handleId,
        );
        const [edge] = existing;
        if (existing.length === 1 && edge) {
          detachedEdgeRef.current = {
            edge,
            index: currentEdges.indexOf(edge),
            wasDirty: isDirty,
          };
          onEdgesChange([{ id: edge.id, type: "remove" }]);
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
        // Restore the detached edge in place since no new connection was made.
        // The graph is unchanged, so it is as dirty as it was before.
        editor.document.setState((current) => {
          const edges = [...current.edges];
          edges.splice(detached.index, 0, detached.edge);
          return { ...current, edges, isDirty: detached.wasDirty };
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
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the canvas container takes focus to receive editor shortcuts
      tabIndex={0}
      className="relative size-full outline-none"
      onKeyDownCapture={handleKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={cancelLongPress}
      onPointerCancelCapture={cancelLongPress}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelLinkCutting}
      onLostPointerCapture={cancelLinkCutting}
    >
      <NodeEditingProvider
        edges={visibleEdges}
        updateNodeData={updateNodeData}
        renamingNodeId={renamingNodeId}
        clearRenamingNodeId={clearRenamingNodeId}
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

      <QuickAddMenu onClosed={focusCanvas} />

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

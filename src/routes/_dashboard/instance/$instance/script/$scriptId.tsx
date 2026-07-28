import { createClient } from "@connectrpc/connect";
import { LogsService } from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import {
  DiagnosticSeverity,
  ScriptService,
} from "@soulfiremc/sdk/generated/soulfire/script_pb";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { PlusIcon, ScrollTextIcon } from "lucide-react";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Separator } from "react-resizable-panels";
import { toast } from "sonner";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { ExecutionLogs } from "@/components/script-editor/ExecutionLogs.tsx";
import { NodePalette } from "@/components/script-editor/NodePalette.tsx";
import {
  NodeTypesProvider,
  useNodeTypes,
} from "@/components/script-editor/NodeTypesContext.tsx";
import { ScriptEditor } from "@/components/script-editor/ScriptEditor.tsx";
import { ScriptToolbar } from "@/components/script-editor/ScriptToolbar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import i18n from "@/lib/i18n";
import { observeServerStream } from "@/lib/protobuf.ts";
import { routeChrome } from "@/lib/route-title.ts";
import {
  edgesToProto,
  nodesToProto,
  scriptDataToStore,
  scriptQueryOptions,
} from "@/lib/script-service.ts";
import { isDemo, timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";
import { useScriptEditorStore } from "@/stores/script-editor-store.ts";

import "@xyflow/react/dist/style.css";

// Default node dimensions for centering on drop (matches min-w-[160px] in BaseNode)
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 80;

// Custom horizontal handle for vertical panel groups
function HorizontalResizableHandle() {
  return (
    <Separator className="relative flex h-px w-full items-center justify-center bg-border after:absolute after:left-0 after:h-1 after:w-full after:-translate-y-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1">
      <div className="bg-border h-6 w-1 rounded-lg z-10 flex shrink-0 rotate-90" />
    </Separator>
  );
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  nodeId: string | null;
  message: string;
}

export const Route = createFileRoute(
  "/_dashboard/instance/$instance/script/$scriptId",
)({
  beforeLoad: () =>
    routeChrome({
      getTitle: (match) => {
        if (typeof match.loaderData === "string" && match.loaderData.trim()) {
          return match.loaderData;
        }

        if (match.params.scriptId === "new") {
          return i18n.t("instance:scripts.createScriptTitle");
        }

        return i18n.t("instance:scripts.title");
      },
      getIcon: () => ({
        kind: "dynamic",
        name: "scroll-text",
      }),
    }),
  loader: async (props) => {
    if (props.params.scriptId === "new") {
      return null;
    }

    const script = await props.context.queryClient.ensureQueryData(
      scriptQueryOptions(
        createTransport(),
        props.params.instance,
        props.params.scriptId,
      ),
    );

    return script?.name ?? null;
  },
  component: ScriptEditorPage,
});

function ScriptEditorSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 border-b p-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Main content */}
      <div className="flex flex-1">
        {/* Node palette */}
        <div className="flex w-48 flex-col gap-2 border-r p-3">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton list
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        {/* Canvas area */}
        <div className="flex flex-1 flex-col">
          <Skeleton className="flex-1" />
          {/* Execution logs */}
          <div className="border-t p-2">
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScriptEditorPage() {
  return (
    <ReactFlowProvider>
      <NodeTypesProvider>
        <Suspense fallback={<ScriptEditorSkeleton />}>
          <ScriptEditorContent />
        </Suspense>
      </NodeTypesProvider>
    </ReactFlowProvider>
  );
}

function ScriptEditorContent() {
  const { t: tInstance } = useTranslation("instance");
  const { instance: instanceId, scriptId } = Route.useParams();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { getDefinition } = useNodeTypes();

  // Required for route context validation
  useSuspenseQuery(instanceInfoQueryOptions);

  // Fetch script data from server (skip for new scripts)
  const { data: serverScriptData } = useSuspenseQuery({
    ...scriptQueryOptions(transport, instanceId, scriptId),
    // For new scripts, return null without making a request
    queryFn:
      scriptId === "new"
        ? () => Promise.resolve(null)
        : scriptQueryOptions(transport, instanceId, scriptId).queryFn,
  });

  const reactFlowInstance = useReactFlow();

  // Script editor store
  const loadScript = useScriptEditorStore((state) => state.loadScript);
  const resetEditor = useScriptEditorStore((state) => state.resetEditor);
  const setDirty = useScriptEditorStore((state) => state.setDirty);
  const setActive = useScriptEditorStore((state) => state.setActive);
  const setActiveNode = useScriptEditorStore((state) => state.setActiveNode);
  const addNode = useScriptEditorStore((state) => state.addNode);
  const findClosestEdge = useScriptEditorStore(
    (state) => state.findClosestEdge,
  );
  const insertNodeOnEdge = useScriptEditorStore(
    (state) => state.insertNodeOnEdge,
  );
  const getScriptData = useScriptEditorStore((state) => state.getScriptData);
  const markSaved = useScriptEditorStore((state) => state.markSaved);
  const addNodeExecutionTime = useScriptEditorStore(
    (state) => state.addNodeExecutionTime,
  );
  const setExecutionStats = useScriptEditorStore(
    (state) => state.setExecutionStats,
  );

  const isMobile = useIsMobile();

  // Local state
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nodePaletteOpen, setNodePaletteOpen] = useState(false);
  const [executionLogsOpen, setExecutionLogsOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const executionAbortRef = useRef<AbortController | null>(null);
  // Pointer-based drag state (replaces HTML5 DnD which is broken in WebView2)
  const draggedNodeTypeRef = useRef<string | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{
    icon: string;
    label: string;
    startX: number;
    startY: number;
  } | null>(null);

  // Load script into store when data changes
  useEffect(() => {
    if (scriptId === "new") {
      resetEditor();
    } else if (serverScriptData) {
      loadScript(scriptDataToStore(serverScriptData));
    }
  }, [scriptId, serverScriptData, loadScript, resetEditor]);

  // Load previous execution logs on mount
  useEffect(() => {
    if (scriptId === "new" || !transport || isDemo()) return;

    const abortController = new AbortController();
    const logsService = createClient(LogsService, transport);
    void logsService
      .getPrevious(
        {
          scope: {
            scope: {
              case: "instanceScript",
              value: { instanceId, scriptId },
            },
          },
          count: 300,
        },
        { signal: abortController.signal },
      )
      .then((call) => {
        const entries: LogEntry[] = call.messages.map((msg) => {
          const rawLevel = msg.level?.toLowerCase();
          const level: LogEntry["level"] =
            rawLevel === "info"
              ? "info"
              : rawLevel === "warn" || rawLevel === "warning"
                ? "warn"
                : rawLevel === "error" || rawLevel === "fatal"
                  ? "error"
                  : "debug";
          return {
            id: msg.id,
            timestamp: msg.timestamp
              ? timestampToDate(msg.timestamp)
              : new Date(),
            level,
            nodeId: null,
            message: msg.message,
          };
        });
        if (entries.length > 0) {
          setLogs((prev) => [...entries, ...prev]);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [transport, instanceId, scriptId]);

  // Item 25: Debounced live validation
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const setValidationDiagnostics = useScriptEditorStore(
    (state) => state.setValidationDiagnostics,
  );
  const nodes = useScriptEditorStore((state) => state.nodes);
  const edges = useScriptEditorStore((state) => state.edges);

  useEffect(() => {
    if (!transport || scriptId === "new") return;
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    validationTimeoutRef.current = setTimeout(async () => {
      try {
        const client = createClient(ScriptService, transport);
        const result = await client.validateScript({
          instanceId,
          nodes: nodesToProto(nodes),
          edges: edgesToProto(edges),
        });
        const diagnostics = result.diagnostics.map((d) => ({
          nodeId: d.nodeId,
          edgeId: d.edgeId,
          message: d.message,
          severity:
            d.severity === DiagnosticSeverity.DIAGNOSTIC_WARNING
              ? ("warning" as const)
              : ("error" as const),
        }));
        setValidationDiagnostics(diagnostics);
      } catch {
        // Validation is best-effort, don't show errors
      }
    }, 500);
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [transport, instanceId, scriptId, nodes, edges, setValidationDiagnostics]);

  // Create script mutation
  const createMutation = useMutation({
    mutationKey: ["script", "create", instanceId],
    mutationFn: async () => {
      if (!transport) throw new Error("No transport available");
      // Read fresh from the store to avoid stale closure issues
      const scriptData = getScriptData();
      const client = createClient(ScriptService, transport);
      const result = await client.createScript({
        instanceId,
        name: scriptData.name || tInstance("scripts.untitledScript"),
        description: scriptData.description,
        nodes: nodesToProto(scriptData.nodes),
        edges: edgesToProto(scriptData.edges),
        paused: scriptData.paused,
        quotas: scriptData.quotas,
      });
      return result;
    },
    onSuccess: (response) => {
      setDirty(false);
      markSaved();
      toast.success(tInstance("scripts.saveSuccess"));
      // Navigate to the real script ID
      if (response.script) {
        void navigate({
          to: "/instance/$instance/script/$scriptId",
          params: { instance: instanceId, scriptId: response.script.id },
          replace: true,
        });
      }
    },
    onError: (error) => {
      console.error("Failed to create script:", error);
      toast.error(tInstance("scripts.saveError"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });

  // Update script mutation
  const updateMutation = useMutation({
    mutationKey: ["script", "update", instanceId, scriptId],
    mutationFn: async () => {
      if (!transport) throw new Error("No transport available");
      // Read fresh from the store to avoid stale closure issues
      const scriptData = getScriptData();
      const client = createClient(ScriptService, transport);
      const result = await client.updateScript({
        instanceId,
        scriptId,
        name: scriptData.name,
        description: scriptData.description,
        nodes: nodesToProto(scriptData.nodes),
        edges: edgesToProto(scriptData.edges),
        updateNodes: true,
        updateEdges: true,
        paused: scriptData.paused,
        quotas: scriptData.quotas,
        updateQuotas: true,
      });
      return result;
    },
    onSuccess: () => {
      setDirty(false);
      markSaved();
      toast.success(tInstance("scripts.saveSuccess"));
    },
    onError: (error) => {
      console.error("Failed to update script:", error);
      toast.error(tInstance("scripts.saveError"));
    },
    onSettled: () => {
      // Only invalidate the script list (for sidebar updates), not the
      // individual script query.  Re-fetching the individual script would
      // call loadScript and overwrite the local store, which can race with
      // the server and revert changes the user just made (e.g. node labels).
      void queryClient.invalidateQueries({
        queryKey: ["scripts", instanceId],
      });
    },
  });

  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      if (scriptId === "new") {
        await createMutation.mutateAsync();
      } else {
        await updateMutation.mutateAsync();
      }
    } finally {
      setIsSaving(false);
    }
  }, [scriptId, createMutation, updateMutation]);

  // Handle script activation
  const handleStart = useCallback(async () => {
    if (!transport || scriptId === "new") {
      toast.error(tInstance("scripts.saveFirstBeforeActivating"));
      return;
    }

    // Abort any existing execution
    if (executionAbortRef.current) {
      executionAbortRef.current.abort();
    }

    const abortController = new AbortController();
    executionAbortRef.current = abortController;

    setActive(true);
    setActiveNode(null);
    setLogs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: "info",
        nodeId: null,
        message: tInstance("scripts.activating"),
      },
    ]);

    try {
      const client = createClient(ScriptService, transport);
      const responses = client.activateScript(
        { instanceId, scriptId },
        { signal: abortController.signal },
      );
      useScriptEditorStore.setState({ paused: false });
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });

      void observeServerStream(responses, {
        onMessage: (event) => {
          if (event.event.case === "scriptStarted") {
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: "info",
                nodeId: null,
                message: tInstance("scripts.activated"),
              },
            ]);
            toast.success(tInstance("scripts.activateSuccess"));
          } else if (event.event.case === "nodeStarted") {
            const nodeId = event.event.value.nodeId;
            setActiveNode(nodeId);
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: "debug",
                nodeId,
                message: tInstance("scripts.nodeStarted", { nodeId }),
              },
            ]);
          } else if (event.event.case === "nodeCompleted") {
            const nodeId = event.event.value.nodeId;
            const execTimeNanos = event.event.value.executionTimeNanos;
            if (execTimeNanos > 0n) {
              addNodeExecutionTime(nodeId, Number(execTimeNanos) / 1_000_000);
            }
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: "debug",
                nodeId,
                message: tInstance("scripts.nodeCompleted", { nodeId }),
              },
            ]);
          } else if (event.event.case === "executionStats") {
            const { nodeCount, maxCount } = event.event.value;
            setExecutionStats({
              nodeCount: Number(nodeCount),
              maxCount: Number(maxCount),
            });
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: "info",
                nodeId: null,
                message: `Execution stats: ${nodeCount}/${maxCount} nodes executed`,
              },
            ]);
          } else if (event.event.case === "nodeError") {
            const { nodeId, errorMessage } = event.event.value;
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: "error",
                nodeId,
                message: tInstance("scripts.nodeError", {
                  error: errorMessage,
                }),
              },
            ]);
          } else if (event.event.case === "scriptLog") {
            const { nodeId, level, message } = event.event.value;
            const normalizedLevel = (level?.toLowerCase() || "info") as
              | "debug"
              | "info"
              | "warn"
              | "error";
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: normalizedLevel,
                nodeId: nodeId ?? null,
                message,
              },
            ]);
          } else if (event.event.case === "scriptCompleted") {
            const success = event.event.value.success;
            setActive(false);
            setActiveNode(null);
            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: success ? "info" : "warn",
                nodeId: null,
                message: success
                  ? tInstance("scripts.executionCompletedSuccess")
                  : tInstance("scripts.deactivated"),
              },
            ]);
            if (success) {
              toast.success(tInstance("scripts.executionCompleted"));
            }
          }
        },
        onError: (error) => {
          if (abortController.signal.aborted) return;
          console.error("Script execution error:", error);
          setActive(false);
          setActiveNode(null);
          const message =
            error instanceof Error ? error.message : String(error);
          setLogs((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: "error",
              nodeId: null,
              message: tInstance("scripts.executionError", {
                error: message,
              }),
            },
          ]);
          toast.error(tInstance("scripts.executionFailed"));
        },
        onComplete: () => {
          if (abortController.signal.aborted) return;
          setActive(false);
          setActiveNode(null);
        },
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      console.error("Failed to activate script:", error);
      setActive(false);
      toast.error(tInstance("scripts.activateError"));
    }
  }, [
    transport,
    instanceId,
    scriptId,
    setActive,
    setActiveNode,
    tInstance,
    queryClient,
    addNodeExecutionTime,
    setExecutionStats,
  ]);

  // Handle script deactivation
  const handleStop = useCallback(async () => {
    // Abort the streaming connection
    if (executionAbortRef.current) {
      executionAbortRef.current.abort();
      executionAbortRef.current = null;
    }

    if (!transport || scriptId === "new") return;

    try {
      const client = createClient(ScriptService, transport);
      await client.deactivateScript({ instanceId, scriptId });
      setActive(false);
      setActiveNode(null);
      useScriptEditorStore.setState({ paused: true });
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          level: "info",
          nodeId: null,
          message: tInstance("scripts.deactivatedByUser"),
        },
      ]);
      toast.success(tInstance("scripts.deactivateSuccess"));
    } catch (error) {
      console.error("Failed to deactivate script:", error);
      // Even if the RPC fails, mark as deactivated locally
      setActive(false);
      setActiveNode(null);
    }
  }, [
    transport,
    instanceId,
    scriptId,
    setActive,
    setActiveNode,
    tInstance,
    queryClient,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (executionAbortRef.current) {
        executionAbortRef.current.abort();
      }
    };
  }, []);

  // Handle zoom controls
  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn();
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut();
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  // Handle clear logs
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Handle drag & drop from palette using pointer events instead of HTML5 DnD.
  // This keeps drag behavior consistent across browser and desktop runtimes.
  const handleNodeDragStart = useCallback(
    (nodeType: string, x: number, y: number) => {
      draggedNodeTypeRef.current = nodeType;
      const definition = getDefinition(nodeType);
      if (definition) {
        setDragPreview({
          icon: definition.icon,
          label: definition.label,
          startX: x,
          startY: y,
        });
      }
    },
    [getDefinition],
  );

  // Mobile: tap a node in the palette to add it at viewport center
  const handleMobileNodeAdd = useCallback(
    (nodeType: string) => {
      const definition = getDefinition(nodeType);
      if (!definition) return;

      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });

      const centeredPosition = {
        x: position.x - DEFAULT_NODE_WIDTH / 2,
        y: position.y - DEFAULT_NODE_HEIGHT / 2,
      };

      addNode(nodeType, centeredPosition, definition.defaultData);
      setNodePaletteOpen(false);
    },
    [reactFlowInstance, addNode, getDefinition],
  );

  useEffect(() => {
    if (!dragPreview) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (dragPreviewRef.current) {
        dragPreviewRef.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const nodeType = draggedNodeTypeRef.current;
      draggedNodeTypeRef.current = null;
      setDragPreview(null);

      if (!nodeType) return;

      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }

      const definition = getDefinition(nodeType);
      if (!definition) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const centeredPosition = {
        x: position.x - DEFAULT_NODE_WIDTH / 2,
        y: position.y - DEFAULT_NODE_HEIGHT / 2,
      };

      // Check if dropping near an existing edge
      const closestEdge = findClosestEdge(position, 30);

      const newNodeId = addNode(
        nodeType,
        centeredPosition,
        definition.defaultData,
      );

      if (closestEdge) {
        insertNodeOnEdge(newNodeId, closestEdge.id);
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    dragPreview,
    reactFlowInstance,
    addNode,
    getDefinition,
    findClosestEdge,
    insertNodeOnEdge,
  ]);

  if (isMobile) {
    return (
      <div className="flex h-full w-full flex-col">
        {/* Compact Toolbar */}
        <ScriptToolbar
          instanceId={instanceId}
          onSave={handleSave}
          onStart={handleStart}
          onStop={handleStop}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          isSaving={isSaving}
        />

        {/* Full-screen canvas */}
        <div className="relative flex-1">
          <div
            role="application"
            ref={reactFlowWrapper}
            className="h-full w-full"
          >
            <ScriptEditor />
          </div>

          {/* Floating action buttons */}
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            <Button
              size="icon"
              className="size-12 rounded-full shadow-lg"
              onClick={() => setNodePaletteOpen(true)}
            >
              <PlusIcon className="size-5" />
              <span className="sr-only">
                {tInstance("scripts.editor.palette.title")}
              </span>
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-12 rounded-full shadow-lg"
              onClick={() => setExecutionLogsOpen(true)}
            >
              <ScrollTextIcon className="size-5" />
              <span className="sr-only">
                {tInstance("scripts.editor.logs.title")}
              </span>
            </Button>
          </div>
        </div>

        {/* Node Palette Sheet (left) */}
        <Sheet open={nodePaletteOpen} onOpenChange={setNodePaletteOpen}>
          <SheetContent side="left" className="w-[80vw] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>
                {tInstance("scripts.editor.palette.title")}
              </SheetTitle>
              <SheetDescription>
                {tInstance("scripts.editor.palette.title")}
              </SheetDescription>
            </SheetHeader>
            <NodePalette onNodeTap={handleMobileNodeAdd} />
          </SheetContent>
        </Sheet>

        {/* Execution Logs Drawer (bottom) */}
        <Drawer open={executionLogsOpen} onOpenChange={setExecutionLogsOpen}>
          <DrawerContent className="max-h-[50vh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>
                {tInstance("scripts.editor.logs.title")}
              </DrawerTitle>
            </DrawerHeader>
            <ExecutionLogs logs={logs} onClearLogs={handleClearLogs} />
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <ScriptToolbar
        instanceId={instanceId}
        onSave={handleSave}
        onStart={handleStart}
        onStop={handleStop}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        isSaving={isSaving}
      />

      {/* Main content area */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Left sidebar - Node Palette */}
        <ResizablePanel defaultSize={20} minSize="12.5rem" maxSize="25rem">
          <NodePalette onNodeDragStart={handleNodeDragStart} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center - Script Editor & Logs */}
        <ResizablePanel defaultSize={80} minSize="18.75rem">
          <ResizablePanelGroup orientation="vertical">
            {/* Canvas */}
            <ResizablePanel defaultSize={75} minSize="12.5rem">
              <div
                role="application"
                ref={reactFlowWrapper}
                className="h-full w-full"
              >
                <ScriptEditor />
              </div>
            </ResizablePanel>

            <HorizontalResizableHandle />

            {/* Bottom - Execution Logs */}
            <ResizablePanel defaultSize={25} minSize="6.25rem" maxSize="25rem">
              <ExecutionLogs logs={logs} onClearLogs={handleClearLogs} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Drag preview overlay for pointer-based DnD */}
      {dragPreview &&
        createPortal(
          <div
            ref={dragPreviewRef}
            className="pointer-events-none fixed left-0 top-0 z-50 flex items-center gap-2 rounded-md border border-border bg-muted/90 px-2 py-1.5 text-sm shadow-md"
            style={{
              transform: `translate(${dragPreview.startX}px, ${dragPreview.startY}px) translate(-50%, -50%)`,
            }}
          >
            <DynamicIcon name={dragPreview.icon} className="size-4 shrink-0" />
            <span className="truncate">{dragPreview.label}</span>
          </div>,
          document.body,
        )}
    </div>
  );
}

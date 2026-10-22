import { createClient } from "@connectrpc/connect";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { PlusIcon, ScrollTextIcon } from "lucide-react";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Separator } from "react-resizable-panels";
import { toast } from "sonner";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { NodePalette } from "@/components/script-editor/NodePalette.tsx";
import {
  NodeTypesProvider,
  useNodeTypes,
} from "@/components/script-editor/NodeTypesContext.tsx";
import { ScriptEditor } from "@/components/script-editor/ScriptEditor.tsx";
import {
  ScriptEditorProvider,
  useScriptEditor,
} from "@/components/script-editor/ScriptEditorProvider";
import { ScriptExecutionLogs } from "@/components/script-editor/ScriptExecutionLogs.tsx";
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
import { InstancePermission } from "@/generated/soulfire/common_pb";
import {
  DiagnosticSeverity,
  ScriptService,
} from "@/generated/soulfire/script_pb";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import i18n from "@/lib/i18n";
import { observeServerStream } from "@/lib/protobuf.ts";
import { routeChrome } from "@/lib/route-title.ts";
import { saveScript } from "@/lib/save-script";
import {
  edgesToProto,
  nodesToProto,
  scriptDataToStore,
  scriptQueryOptions,
  scriptStatusQueryOptions,
} from "@/lib/script-service.ts";
import { hasInstancePermission, isDemo } from "@/lib/utils.tsx";
import { scriptLogLevel, watchScriptLogs } from "@/lib/script-logs";
import { createTransport } from "@/lib/web-rpc.ts";
import { getQuerySessionId } from "@/lib/query-session.ts";
import { getScriptEditorRouteSession } from "@/stores/script-editor-route-session";

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
  const { instance, scriptId } = Route.useParams();
  const [session, setSession] = useState(() =>
    getScriptEditorRouteSession(undefined, instance, scriptId),
  );
  const current = getScriptEditorRouteSession(session, instance, scriptId);
  if (current !== session) setSession(current);
  return (
    <ScriptEditorProvider key={current.key} session={current.editor}>
      <ReactFlowProvider>
        <NodeTypesProvider>
          <Suspense fallback={<ScriptEditorSkeleton />}>
            <ScriptEditorContent />
          </Suspense>
        </NodeTypesProvider>
      </ReactFlowProvider>
    </ScriptEditorProvider>
  );
}

function ScriptEditorContent() {
  const editor = useScriptEditor();
  const { t: tInstance } = useTranslation("instance");
  const { instance: instanceId, scriptId } = Route.useParams();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { getDefinition } = useNodeTypes();

  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const canViewLogs = hasInstancePermission(
    instanceInfo,
    InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
  );

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
  const syncScriptDocument = editor.actions.syncScriptDocument;
  const resetEditor = editor.actions.resetEditor;
  const setActive = editor.actions.setActive;
  const setActiveNode = editor.actions.setActiveNode;
  const completeNode = editor.actions.completeNode;
  const addNode = editor.actions.addNode;
  const findClosestEdge = editor.actions.findClosestEdge;
  const insertNodeOnEdge = editor.actions.insertNodeOnEdge;
  const addNodeExecutionTime = editor.actions.addNodeExecutionTime;
  const setExecutionStats = editor.actions.setExecutionStats;
  const [isControlling, setIsControlling] = useState(false);
  const [hasExecutionStream, setHasExecutionStream] = useState(false);
  const statusOptions = scriptStatusQueryOptions(
    transport,
    instanceId,
    scriptId,
  );
  const { data: scriptStatus } = useQuery(statusOptions);
  const currentScriptId = useSelector(
    editor.document,
    (state) => state.scriptId,
  );

  useEffect(() => {
    if (scriptStatus && !isControlling)
      editor.actions.syncScriptStatus(scriptStatus, hasExecutionStream);
  }, [
    scriptStatus,
    isControlling,
    currentScriptId,
    hasExecutionStream,
    editor,
  ]);

  const acknowledgePause = useCallback(
    (paused: boolean) => {
      editor.actions.setSavedPaused(paused);
      queryClient.setQueryData(
        scriptStatusQueryOptions(transport, instanceId, scriptId).queryKey,
        (current) =>
          current ? { ...current, paused, isActive: !paused } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
      void queryClient.invalidateQueries({
        queryKey: ["script-status", instanceId, scriptId],
      });
    },
    [editor, queryClient, transport, instanceId, scriptId],
  );

  const isMobile = useIsMobile();

  // Local state
  const { addExecutionLog, addExecutionLogs, clearExecutionLogs } =
    editor.actions;
  const [nodePaletteOpen, setNodePaletteOpen] = useState(false);
  const [executionLogsOpen, setExecutionLogsOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const executionAbortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  // Pointer-based drag state (replaces HTML5 DnD which is broken in WebView2)
  const draggedNodeTypeRef = useRef<string | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{
    icon: string;
    label: string;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load script into store when data changes
  useEffect(() => {
    if (scriptId === "new") {
      resetEditor();
    } else if (serverScriptData) {
      syncScriptDocument(scriptDataToStore(serverScriptData));
    }
  }, [scriptId, serverScriptData, syncScriptDocument, resetEditor, editor]);

  useEffect(() => {
    if (scriptId === "new" || !transport || !canViewLogs || isDemo()) return;
    return watchScriptLogs(transport, instanceId, scriptId, addExecutionLogs);
  }, [transport, instanceId, scriptId, addExecutionLogs, canViewLogs]);

  const validationGraph = useSelector(editor.validationGraph);
  const setValidationDiagnostics = editor.actions.setValidationDiagnostics;

  useEffect(() => {
    if (!transport || scriptId === "new") return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const client = createClient(ScriptService, transport);
        const result = await client.validateScript(
          {
            instanceId,
            nodes: nodesToProto(validationGraph.nodes),
            edges: edgesToProto(validationGraph.edges),
          },
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          editor.validationGraph.get() !== validationGraph
        )
          return;
        setValidationDiagnostics(
          result.diagnostics.map((d) => ({
            nodeId: d.nodeId,
            edgeId: d.edgeId,
            message: d.message,
            severity:
              d.severity === DiagnosticSeverity.DIAGNOSTIC_WARNING
                ? "warning"
                : "error",
          })),
        );
      } catch {
        // Validation is best-effort. Keep the last successful diagnostics.
      }
    }, 500);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    transport,
    instanceId,
    scriptId,
    validationGraph,
    setValidationDiagnostics,
    editor,
  ]);

  const saveMutation = useMutation({
    mutationKey: ["script", "save", instanceId],
    onMutate: () => getQuerySessionId(),
    mutationFn: async () => {
      if (!transport) throw new Error("No transport available");
      return saveScript(
        transport,
        instanceId,
        editor,
        tInstance("scripts.untitledScript"),
      );
    },
    onSuccess: (script, _, sessionId) => {
      if (sessionId !== getQuerySessionId()) return;
      queryClient.setQueryData(
        scriptQueryOptions(transport, instanceId, script.id).queryKey,
        script,
      );
      queryClient.setQueryData(
        scriptStatusQueryOptions(transport, instanceId, script.id).queryKey,
        (current) =>
          current
            ? {
                ...current,
                paused: script.paused,
                isActive: script.paused ? false : current.isActive,
              }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: ["script-status", instanceId, script.id],
      });
      toast.success(tInstance("scripts.saveSuccess"));
      if (scriptId === "new" && mounted.current) {
        // The create response already contains the canonical document. Avoid
        // waiting for another read before switching the editor to its saved URL.
        void navigate({
          to: "/instance/$instance/script/$scriptId",
          params: { instance: instanceId, scriptId: script.id },
          replace: true,
        });
      } else {
        void router.invalidate({
          filter: (match) =>
            match.routeId === Route.id &&
            match.params.instance === instanceId &&
            match.params.scriptId === script.id,
        });
      }
    },
    onError: (error) => {
      console.error("Failed to save script:", error);
      toast.error(tInstance("scripts.saveError"));
    },
    onSettled: () => {
      // Refresh the list without reloading the document over local edits.
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate();
  }, [saveMutation]);

  // Handle script activation
  const handleStart = useCallback(async () => {
    if (!transport || scriptId === "new") {
      toast.error(tInstance("scripts.saveFirstBeforeActivating"));
      return;
    }

    setIsControlling(true);
    setHasExecutionStream(true);
    await queryClient.cancelQueries({
      queryKey: ["script-status", instanceId, scriptId],
    });

    // Abort any existing execution
    if (executionAbortRef.current) {
      executionAbortRef.current.abort();
    }

    const abortController = new AbortController();
    executionAbortRef.current = abortController;

    setActive(true);
    setActiveNode(null);
    addExecutionLog({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level: "info",
      nodeId: null,
      message: tInstance("scripts.activating"),
    });

    try {
      const client = createClient(ScriptService, transport);
      const responses = client.activateScript(
        { instanceId, scriptId },
        { signal: abortController.signal },
      );
      void observeServerStream(responses, {
        onMessage: (event) => {
          if (abortController.signal.aborted) return;
          if (event.event.case === "scriptStarted") {
            acknowledgePause(false);
            setIsControlling(false);
            addExecutionLog({
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: "info",
              nodeId: null,
              message: tInstance("scripts.activated"),
            });
            toast.success(tInstance("scripts.activateSuccess"));
          } else if (event.event.case === "nodeStarted") {
            const nodeId = event.event.value.nodeId;
            setActiveNode(nodeId);
            addExecutionLog({
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: "debug",
              nodeId,
              message: tInstance("scripts.nodeStarted", { nodeId }),
            });
          } else if (event.event.case === "nodeCompleted") {
            const nodeId = event.event.value.nodeId;
            completeNode(nodeId);
            const execTimeNanos = event.event.value.executionTimeNanos;
            if (execTimeNanos > 0n) {
              addNodeExecutionTime(nodeId, Number(execTimeNanos) / 1_000_000);
            }
            addExecutionLog({
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: "debug",
              nodeId,
              message: tInstance("scripts.nodeCompleted", { nodeId }),
            });
          } else if (event.event.case === "executionStats") {
            const { nodeCount, maxCount } = event.event.value;
            setExecutionStats({
              nodeCount: Number(nodeCount),
              maxCount: Number(maxCount),
            });
            addExecutionLog({
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: "info",
              nodeId: null,
              message: `Execution stats: ${nodeCount}/${maxCount} nodes executed`,
            });
          } else if (event.event.case === "nodeError") {
            const { nodeId, errorMessage } = event.event.value;
            completeNode(nodeId);
            if (!canViewLogs)
              addExecutionLog({
                id: crypto.randomUUID(),
                timestamp: new Date(),
                level: "error",
                nodeId,
                message: tInstance("scripts.nodeError", {
                  error: errorMessage,
                }),
              });
          } else if (event.event.case === "scriptLog" && !canViewLogs) {
            const { nodeId, level, message } = event.event.value;
            addExecutionLog({
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: scriptLogLevel(level),
              nodeId: nodeId ?? null,
              message,
            });
          } else if (event.event.case === "scriptCompleted") {
            const success = event.event.value.success;
            setActive(false);
            setActiveNode(null);
            void queryClient.invalidateQueries({
              queryKey: ["script-status", instanceId, scriptId],
            });
            addExecutionLog({
              id: crypto.randomUUID(),
              timestamp: new Date(),
              level: success ? "info" : "warn",
              nodeId: null,
              message: success
                ? tInstance("scripts.executionCompletedSuccess")
                : tInstance("scripts.deactivated"),
            });
            if (success) {
              toast.success(tInstance("scripts.executionCompleted"));
            }
          }
        },
        onError: (error) => {
          if (abortController.signal.aborted) return;
          console.error("Script execution error:", error);
          setHasExecutionStream(false);
          setActive(false);
          setActiveNode(null);
          setIsControlling(false);
          void queryClient.invalidateQueries({
            queryKey: ["script-status", instanceId, scriptId],
          });
          const message =
            error instanceof Error ? error.message : String(error);
          addExecutionLog({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            level: "error",
            nodeId: null,
            message: tInstance("scripts.executionError", {
              error: message,
            }),
          });
          toast.error(tInstance("scripts.executionFailed"));
        },
        onComplete: () => {
          if (abortController.signal.aborted) return;
          setHasExecutionStream(false);
          setActive(false);
          setActiveNode(null);
          setIsControlling(false);
        },
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      console.error("Failed to activate script:", error);
      setHasExecutionStream(false);
      setActive(false);
      setIsControlling(false);
      toast.error(tInstance("scripts.activateError"));
    }
  }, [
    transport,
    instanceId,
    scriptId,
    setActive,
    setActiveNode,
    completeNode,
    tInstance,
    queryClient,
    addNodeExecutionTime,
    setExecutionStats,
    addExecutionLog,
    editor.document.setState,
    canViewLogs,
    acknowledgePause,
  ]);

  // Handle script deactivation
  const handleStop = useCallback(async () => {
    setHasExecutionStream(false);
    // Abort the streaming connection
    if (executionAbortRef.current) {
      executionAbortRef.current.abort();
      executionAbortRef.current = null;
    }

    const currentScriptId = editor.document.get().scriptId;
    if (scriptId === "new" && !currentScriptId) {
      editor.actions.setPaused(true);
      setActive(false);
      setActiveNode(null);
      return;
    }
    if (!transport) return;

    setIsControlling(true);
    await queryClient.cancelQueries({
      queryKey: ["script-status", instanceId, scriptId],
    });
    try {
      const client = createClient(ScriptService, transport);
      await client.deactivateScript({
        instanceId,
        scriptId: currentScriptId ?? scriptId,
      });
      setActive(false);
      setActiveNode(null);
      acknowledgePause(true);
      addExecutionLog({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: "info",
        nodeId: null,
        message: tInstance("scripts.deactivatedByUser"),
      });
      toast.success(tInstance("scripts.deactivateSuccess"));
    } catch (error) {
      console.error("Failed to deactivate script:", error);
      toast.error(tInstance("scripts.pauseError"));
      void queryClient.invalidateQueries({
        queryKey: ["script-status", instanceId, scriptId],
      });
    } finally {
      setIsControlling(false);
    }
  }, [
    transport,
    instanceId,
    scriptId,
    setActive,
    setActiveNode,
    tInstance,
    queryClient,
    editor,
    addExecutionLog,
    acknowledgePause,
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
    clearExecutionLogs();
  }, [clearExecutionLogs]);

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
          isControlling={isControlling}
          instanceId={instanceId}
          onSave={handleSave}
          onStart={handleStart}
          onStop={handleStop}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          isSaving={saveMutation.isPending}
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
        <Drawer
          showSwipeHandle
          open={executionLogsOpen}
          onOpenChange={setExecutionLogsOpen}
        >
          <DrawerContent className="max-h-[50vh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>
                {tInstance("scripts.editor.logs.title")}
              </DrawerTitle>
            </DrawerHeader>
            <ScriptExecutionLogs onClearLogs={handleClearLogs} />
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <ScriptToolbar
        isControlling={isControlling}
        instanceId={instanceId}
        onSave={handleSave}
        onStart={handleStart}
        onStop={handleStop}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        isSaving={saveMutation.isPending}
      />

      {/* Main content area */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Left sidebar - Node Palette */}
        <ResizablePanel defaultSize="20%" minSize="12.5rem" maxSize="25rem">
          <NodePalette onNodeDragStart={handleNodeDragStart} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center - Script Editor & Logs */}
        <ResizablePanel defaultSize="80%" minSize="18.75rem">
          <ResizablePanelGroup orientation="vertical">
            {/* Canvas */}
            <ResizablePanel defaultSize="75%" minSize="12.5rem">
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
            <ResizablePanel defaultSize="25%" minSize="6.25rem" maxSize="25rem">
              <ScriptExecutionLogs onClearLogs={handleClearLogs} />
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

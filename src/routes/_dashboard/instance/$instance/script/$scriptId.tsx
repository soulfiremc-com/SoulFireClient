import { createRpcClient } from "@/lib/rpc";
import { useAtomSet } from "@effect/atom-react";
import { Effect } from "effect";
import { Atom } from "effect/reactivity";

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  useBlocker,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { batch } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { PlusIcon, ScrollTextIcon } from "lucide-react";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Separator } from "react-resizable-panels";
import { toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { NodePalette } from "@/components/script-editor/NodePalette.tsx";
import { NodeTypesProvider } from "@/components/script-editor/NodeTypesContext.tsx";
import { useNodeTypes } from "@/components/script-editor/node-types-context.ts";
import { ScriptEditor } from "@/components/script-editor/ScriptEditor.tsx";
import { readDrawnEdgeShapes } from "@/components/script-editor/drawn-edge-shapes";
import { ScriptEditorProvider } from "@/components/script-editor/ScriptEditorProvider";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import { ScriptExecutionLogs } from "@/components/script-editor/ScriptExecutionLogs.tsx";
import { ScriptToolbar } from "@/components/script-editor/ScriptToolbar.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
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
  type ScriptEvent,
  ScriptService,
} from "@/generated/soulfire/script_pb";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import i18n from "@/lib/i18n";
import { valueToJson } from "@/lib/protobuf.ts";
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
import {
  makeScriptActivationAtom,
  makeScriptValidationAtom,
} from "@/lib/script-editor-atoms";
import { scriptLogLevel, watchScriptLogs } from "@/lib/script-logs";
import { createTransport } from "@/lib/web-rpc.ts";
import { getQuerySessionId } from "@/lib/query-session.ts";
import { getScriptEditorRouteSession } from "@/stores/script-editor-route-session";
import type { ValidationDiagnostic } from "@/stores/script-editor-derived";

import "@xyflow/react/dist/style.css";

// Default node dimensions for centering on drop (matches min-w-[160px] in BaseNode)
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 80;

// Custom horizontal handle for vertical panel groups
function HorizontalResizableHandle() {
  return (
    <Separator className="relative flex h-px w-full items-center justify-center bg-border after:absolute after:left-0 after:h-1 after:w-full after:-translate-y-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none">
      <div className="z-10 flex h-6 w-1 shrink-0 rotate-90 rounded-lg bg-border" />
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

        if (match.params["scriptId"] === "new") {
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

const PALETTE_SKELETON_SLOTS = [
  "node-1",
  "node-2",
  "node-3",
  "node-4",
  "node-5",
  "node-6",
];

function ScriptEditorSkeleton() {
  return (
    <div className="flex size-full flex-col">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 border-b p-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Main content */}
      <div className="flex flex-1">
        {/* Node palette */}
        <div className="flex w-48 flex-col gap-2 border-r p-3">
          <Skeleton className="h-8 w-full" />
          {PALETTE_SKELETON_SLOTS.map((slot) => (
            <Skeleton key={slot} className="h-8 w-full" />
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
      <UnsavedChangesGuard />
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

/** Asks before leaving the editor with changes that are not saved. */
function UnsavedChangesGuard() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const isDirty = useSelector(editor.document, (state) => state.isDirty);
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      const { isDirty: dirty, scriptId } = editor.document.get();
      if (!dirty || next.pathname === current.pathname) return false;
      // Saving a new script moves the same editor to the script's own URL.
      return !(
        next.routeId === Route.id &&
        "scriptId" in next.params &&
        next.params.scriptId === scriptId
      );
    },
    // In Electron, the main process shows a native prompt for this.
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });

  return (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("scripts.editor.unsavedDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("scripts.editor.unsavedDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("scripts.editor.unsavedDialog.stay")}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={blocker.proceed}>
            {t("scripts.editor.unsavedDialog.leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const startNode = editor.actions.startNode;
  const completeNode = editor.actions.completeNode;
  const addNode = editor.actions.addNode;
  const findClosestEdge = editor.actions.findClosestEdge;
  const insertNodeOnEdge = editor.actions.insertNodeOnEdge;
  const addNodeExecutionTime = editor.actions.addNodeExecutionTime;
  const recordNodeOutputs = editor.actions.recordNodeOutputs;
  const observesNodeOutputs = editor.actions.observesNodeOutputs;
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
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [activationAtom] = useState(makeScriptActivationAtom<ScriptEvent>);
  const activate = useAtomSet(activationAtom);
  const mounted = useRef(true);
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
    if (scriptId === "new" || !transport || !canViewLogs || isDemo())
      return undefined;
    return watchScriptLogs(transport, instanceId, scriptId, addExecutionLogs);
  }, [transport, instanceId, scriptId, addExecutionLogs, canViewLogs]);

  const validationGraph = useSelector(editor.validationGraph);
  const setValidationDiagnostics = editor.actions.setValidationDiagnostics;

  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [validationAtom] = useState(
    makeScriptValidationAtom<ValidationDiagnostic[]>,
  );
  const validate = useAtomSet(validationAtom);

  useEffect(() => {
    if (!transport || scriptId === "new") {
      validate(Atom.Interrupt);
      return;
    }
    validate({
      validate: createRpcClient(ScriptService, transport)
        .validateScript({
          instanceId,
          nodes: nodesToProto(validationGraph.nodes),
          edges: edgesToProto(validationGraph.edges),
        })
        .pipe(
          Effect.map((result) =>
            result.diagnostics.map((d) => ({
              nodeId: d.nodeId,
              edgeId: d.edgeId,
              message: d.message,
              severity:
                d.severity === DiagnosticSeverity.DIAGNOSTIC_WARNING
                  ? "warning"
                  : "error",
            })),
          ),
        ),
      onDiagnostics: (diagnostics) => {
        // The store can hold a newer graph before its validation starts.
        if (editor.validationGraph.get() === validationGraph)
          setValidationDiagnostics(diagnostics);
      },
    });
  }, [
    transport,
    instanceId,
    scriptId,
    validationGraph,
    setValidationDiagnostics,
    validate,
    editor,
  ]);

  const { mutate: mutateSave, isPending: isSavePending } = useMutation({
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
    if (!transport) {
      toast.info(i18n.t("common:commandPalette.feedback.demo"));
      return;
    }
    mutateSave();
  }, [mutateSave, transport]);

  // Handle script activation
  const handleStart = useCallback(async () => {
    if (!transport) {
      toast.info(i18n.t("common:commandPalette.feedback.demo"));
      return;
    }
    if (scriptId === "new") {
      toast.error(tInstance("scripts.saveFirstBeforeActivating"));
      return;
    }

    setIsControlling(true);
    setHasExecutionStream(true);
    await queryClient.cancelQueries({
      queryKey: ["script-status", instanceId, scriptId],
    });

    setActive(true);
    setActiveNode(null);
    addExecutionLog({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level: "info",
      nodeId: null,
      message: tInstance("scripts.activating"),
    });

    let started = false;
    // A new activation stops the stream of the previous one.
    activate({
      events: createRpcClient(ScriptService, transport).activateScript({
        instanceId,
        scriptId,
      }),
      onEvent: (event) => {
        if (event.event.case === "scriptStarted") {
          started = true;
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
          // The canvas highlights running nodes. Logging every node start
          // and finish would push real errors out of the capped log.
          startNode(event.event.value.nodeId, event.event.value.executionId);
        } else if (event.event.case === "nodeCompleted") {
          const { nodeId, executionId, outputs, executionTimeNanos } =
            event.event.value;
          // One update per event keeps node selectors from running twice.
          batch(() => {
            completeNode(nodeId, executionId);
            // Converting outputs is costly, so skip nodes nobody watches.
            if (
              Object.keys(outputs).length > 0 &&
              observesNodeOutputs(nodeId)
            ) {
              recordNodeOutputs(
                nodeId,
                Object.fromEntries(
                  Object.entries(outputs).map(([port, value]) => [
                    port,
                    valueToJson(value),
                  ]),
                ),
              );
            }
            if (executionTimeNanos > 0n) {
              addNodeExecutionTime(
                nodeId,
                Number(executionTimeNanos) / 1_000_000,
              );
            }
          });
        } else if (event.event.case === "executionStats") {
          const { nodeCount, maxCount } = event.event.value;
          addExecutionLog({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            level: "info",
            nodeId: null,
            message: i18n.t("instance:scripts.executionStats", {
              executed: Number(nodeCount),
              max: Number(maxCount),
            }),
          });
        } else if (event.event.case === "nodeError") {
          const { nodeId, errorMessage } = event.event.value;
          completeNode(nodeId, event.event.value.executionId);
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
        console.error("Script monitoring stream error:", error);
        setHasExecutionStream(false);
        setActive(false);
        setActiveNode(null);
        setIsControlling(false);
        void queryClient.invalidateQueries({
          queryKey: ["script-status", instanceId, scriptId],
        });
        const message = error instanceof Error ? error.message : String(error);
        addExecutionLog({
          id: crypto.randomUUID(),
          timestamp: new Date(),
          level: started ? "warn" : "error",
          nodeId: null,
          message: tInstance(
            started ? "scripts.monitoringError" : "scripts.executionError",
            {
              error: message,
            },
          ),
        });
        if (started) toast.warning(tInstance("scripts.monitoringDisconnected"));
        else toast.error(tInstance("scripts.activateError"));
      },
      onComplete: () => {
        setHasExecutionStream(false);
        setActive(false);
        setActiveNode(null);
        setIsControlling(false);
      },
    });
  }, [
    transport,
    instanceId,
    scriptId,
    setActive,
    setActiveNode,
    startNode,
    completeNode,
    tInstance,
    queryClient,
    addNodeExecutionTime,
    recordNodeOutputs,
    observesNodeOutputs,
    addExecutionLog,
    canViewLogs,
    acknowledgePause,
    activate,
  ]);

  // Handle script deactivation
  const handleStop = useCallback(async () => {
    setHasExecutionStream(false);
    // Stop following the activation stream.
    activate(Atom.Interrupt);

    const documentScriptId = editor.document.get().scriptId;
    if (scriptId === "new" && !documentScriptId) {
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
      const client = createRpcClient(ScriptService, transport);
      await Effect.runPromise(
        client.deactivateScript({
          instanceId,
          scriptId: documentScriptId ?? scriptId,
        }),
      );
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
    activate,
  ]);

  // Handle clear logs
  const handleClearLogs = useCallback(() => {
    clearExecutionLogs();
  }, [clearExecutionLogs]);

  // Click, tap, or Enter on a palette node adds it at the canvas center.
  const handleNodeAdd = useCallback(
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

  // The palette drags with pointer events, because HTML5 drag and drop is
  // broken in WebView2. A drop near a wire splices the node into it.
  const handleNodeDrop = useCallback(
    (nodeType: string, x: number, y: number) => {
      const wrapper = reactFlowWrapper.current;
      const definition = getDefinition(nodeType);
      if (!wrapper || !definition) return;

      const rect = wrapper.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({ x, y });
      const centeredPosition = {
        x: position.x - DEFAULT_NODE_WIDTH / 2,
        y: position.y - DEFAULT_NODE_HEIGHT / 2,
      };
      const closestEdge = findClosestEdge(
        position,
        30,
        readDrawnEdgeShapes(wrapper),
      );

      // Adding the node and splicing it into the wire is one undo step.
      editor.actions.beginHistoryGesture();
      const newNodeId = addNode(
        nodeType,
        centeredPosition,
        definition.defaultData,
      );
      if (closestEdge) {
        insertNodeOnEdge(newNodeId, closestEdge.id);
      }
      editor.actions.endHistoryGesture();
    },
    [
      editor,
      reactFlowInstance,
      addNode,
      getDefinition,
      findClosestEdge,
      insertNodeOnEdge,
    ],
  );

  if (isMobile) {
    return (
      <div className="flex size-full flex-col">
        {/* Compact Toolbar */}
        <ScriptToolbar
          isControlling={isControlling}
          instanceId={instanceId}
          onSave={handleSave}
          onStart={() => void handleStart()}
          onStop={() => void handleStop()}
          isSaving={isSavePending}
        />

        {/* Full-screen canvas */}
        <div className="relative flex-1">
          <div role="application" ref={reactFlowWrapper} className="size-full">
            <ScriptEditor />
          </div>

          {/* Floating action buttons */}
          <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-2">
            <Button
              size="icon"
              className="size-12 rounded-full shadow-lg"
              onClick={() => {
                setNodePaletteOpen(true);
              }}
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
              onClick={() => {
                setExecutionLogsOpen(true);
              }}
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
            <NodePalette onNodeAdd={handleNodeAdd} />
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
    <div className="flex size-full flex-col">
      {/* Toolbar */}
      <ScriptToolbar
        isControlling={isControlling}
        instanceId={instanceId}
        onSave={handleSave}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
        isSaving={isSavePending}
      />

      {/* Main content area */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Left sidebar - Node Palette */}
        <ResizablePanel defaultSize="20%" minSize="12.5rem" maxSize="25rem">
          <NodePalette onNodeDrop={handleNodeDrop} onNodeAdd={handleNodeAdd} />
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
                className="size-full"
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
    </div>
  );
}

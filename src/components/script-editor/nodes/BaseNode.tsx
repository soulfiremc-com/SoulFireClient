import { t as translate } from "i18next";
import { useSelector } from "@tanstack/react-store";
import {
  type Edge,
  Handle,
  type NodeProps,
  Position,
  useReactFlow,
} from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  CircleAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EMPTY_DIAGNOSTICS } from "@/stores/script-editor-derived";
import { MultiInputOrderList } from "../MultiInputOrderList";
import { NodePreview } from "../NodePreview";
import { EditableNodeLabel } from "./EditableNodeLabel";
import { InlineEditor } from "./InlineEditor";
import {
  getHandleShape,
  getNodeDefinition,
  getPortColor,
  getPortDefinition,
  getResolvedPortType,
  hasTypeVariables,
  type NodeDefinition,
  type PortDefinition,
  type PortType,
  type TypeDescriptor,
} from "./types";
import { nodeDataString } from "@/lib/script-node-data";

const NO_HIDDEN_SOCKETS: readonly string[] = [];

// Stable empty object to avoid creating new references in selectors
const EMPTY_PREVIEW_VALUES: Record<string, unknown> = {};
const EMPTY_MULTI_INPUT_ITEMS: {
  id: string;
  index: number;
  label: string;
  sublabel?: string | undefined;
}[] = [];

export interface BaseNodeData {
  label?: string;
  /** Whether this node is muted (bypassed during execution) */
  muted?: boolean;
  /** Whether this node is collapsed (showing only header) */
  collapsed?: boolean;
  /** Hidden socket IDs or special flag for hiding unconnected */
  hiddenSockets?: string[];
  [key: string]: unknown;
}

interface BaseNodeProps extends NodeProps {
  data: BaseNodeData;
  definition: NodeDefinition;
  /** Current edges in the graph - used to determine connected ports */
  edges?: Edge[];
  /** Callback to update node data */
  onDataChange?: (data: Record<string, unknown>) => void;
  /** Resolved type variable bindings from generic inference */
  typeBindings?: Map<string, TypeDescriptor> | undefined;
}

/**
 * Get the field key from a port ID.
 * Port IDs are now simple names (e.g., "interval", "message"),
 * so we just return the port ID directly.
 */
function getFieldKey(portId: string): string {
  return portId;
}

// Servers send defaults as JSON. Keep the raw text if it is not valid JSON.
function parseDefaultValue(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Colors a port green or red while a wire hovers it, and gives touch screens a
 * larger target than the small visible dot.
 */
const HANDLE_FEEDBACK_CLASS =
  "[&.connectingto.valid]:ring-2 [&.connectingto.valid]:ring-success [&.connectingto:not(.valid)]:ring-2 [&.connectingto:not(.valid)]:ring-destructive pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-['']";

interface PortRowProps {
  port: PortDefinition;
  type: "source" | "target";
  position: Position;
  translatedLabel: string;
  collapsed?: boolean;
  isConnected?: boolean;
  value?: unknown;
  onValueChange?: (value: unknown) => void;
  /** Resolved port type after generic type inference (overrides static type for color/shape) */
  resolvedType?: PortType | undefined;
  multiInputItems?: {
    id: string;
    index: number;
    label: string;
    sublabel?: string | undefined;
  }[];
  onReorderMultiInput?: (orderedEdgeIds: string[]) => void;
}

function PortRow({
  port,
  type,
  position,
  translatedLabel,
  collapsed,
  isConnected,
  value,
  onValueChange,
  resolvedType,
  multiInputItems = EMPTY_MULTI_INPUT_ITEMS,
  onReorderMultiInput,
}: PortRowProps) {
  // Use resolved type for color/shape when available (from generic inference)
  const effectiveType = resolvedType ?? port.type;
  const color = getPortColor(effectiveType);
  const handleShape = getHandleShape(effectiveType);
  const isMultiInput = port.multiInput;
  const isLeft = position === Position.Left;
  const hasDefault = port.defaultValue !== undefined;
  const isInput = type === "target";

  // Calculate handle dimensions based on shape (data-driven)
  // Square/diamond handles are larger than circular ones
  const isSquareOrDiamond =
    handleShape === "square" || handleShape === "diamond";
  const handleWidth = isMultiInput ? 16 : isSquareOrDiamond ? 10 : 8;
  const handleHeight = isSquareOrDiamond ? 10 : 8;
  const handleBorderRadius = isMultiInput ? 4 : isSquareOrDiamond ? 2 : "50%";

  // Show inline editor for inputs that:
  // 1. Have a default value (are configurable)
  // 2. Are not connected (no incoming wire)
  // 3. Are not execution/flow ports (square handles)
  // 4. Are not collapsed
  const showInlineEditor =
    isInput &&
    hasDefault &&
    !isConnected &&
    handleShape !== "square" &&
    !collapsed;
  const showMultiInputList = isInput && isMultiInput && !collapsed;

  // When collapsed, render handles at the edges without labels
  if (collapsed) {
    return (
      <Handle
        type={type}
        position={position}
        id={port.id}
        className={cn(
          "absolute! transition-transform hover:scale-125",
          HANDLE_FEEDBACK_CLASS,
        )}
        title={port.description || undefined}
        style={{
          background: color,
          width: handleWidth,
          height: handleHeight,
          border: "2px solid var(--background)",
          borderRadius: handleBorderRadius,
          top: "50%",
          transform: "translateY(-50%)",
          ...(isLeft ? { left: -4 } : { right: -4 }),
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 py-1",
        isLeft ? "pr-2" : "flex-row-reverse pl-2",
      )}
    >
      <Handle
        type={type}
        position={position}
        id={port.id}
        className={cn(
          "relative! top-0! transform-none! transition-transform hover:scale-125",
          HANDLE_FEEDBACK_CLASS,
        )}
        style={{
          background: color,
          // Dimensions are data-driven based on handle shape
          width: handleWidth,
          height: handleHeight,
          border: "2px solid var(--background)",
          // Shape determines border radius: circle = 50%, square/diamond = 2
          borderRadius: handleBorderRadius,
        }}
        title={
          isMultiInput
            ? `${translate("instance:scripts.editor.multiInput.title")}${port.description ? ` (${port.description})` : ""}`
            : port.description || undefined
        }
      />

      {showInlineEditor && onValueChange ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">
            {translatedLabel}
          </span>
          <InlineEditor
            type={port.type}
            value={value}
            defaultValue={parseDefaultValue(port.defaultValue)}
            onChange={onValueChange}
            label={translatedLabel}
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-xs",
              isConnected ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {translatedLabel}
          </span>
          {showMultiInputList && onReorderMultiInput && (
            <div className="mt-1">
              <MultiInputOrderList
                items={multiInputItems}
                onReorder={onReorderMultiInput}
                compact
                emptyLabel={translate(
                  "instance:scripts.editor.multiInput.connectTo",
                  {
                    label: translatedLabel,
                  },
                )}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Keeps node badge taps from dragging the node or panning the canvas. */
const NODE_BADGE_CLASS =
  "nodrag nopan rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-['']";

/**
 * Error and warning counts for one node. Hover, focus, or tap shows the
 * messages, so touch screens can read them too.
 */
function ValidationBadges({ nodeId }: { nodeId: string }) {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const diagnostics = useSelector(
    editor.validation,
    (s) => s.diagnosticsByNode.get(nodeId) ?? EMPTY_DIAGNOSTICS,
  );
  if (diagnostics.length === 0) return null;

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const summary = [
    errors.length > 0 && t("scripts.health.errors", { count: errors.length }),
    warnings.length > 0 &&
      t("scripts.health.warnings", { count: warnings.length }),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        render={
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the component renders its children inside this button, which gives it its text label
          <button
            type="button"
            className={cn("flex items-center gap-0.5", NODE_BADGE_CLASS)}
          />
        }
      >
        <span className="sr-only">{summary}</span>
        {errors.length > 0 && (
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-destructive text-4xs font-bold text-white"
          >
            {errors.length}
          </span>
        )}
        {warnings.length > 0 && (
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-warning-muted text-4xs font-bold text-white"
          >
            {warnings.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72">
        <PopoverTitle>{summary}</PopoverTitle>
        <ul className="flex flex-col gap-1.5 text-xs">
          {diagnostics.map((d) => (
            <li
              key={`${d.severity}:${d.edgeId}:${d.message}`}
              className="flex items-start gap-1.5"
            >
              {d.severity === "error" ? (
                <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" />
              ) : (
                <TriangleAlertIcon className="size-3.5 shrink-0 text-warning-emphasis" />
              )}
              <span>{d.message}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Average run time for one node. Hover, focus, or tap shows the details. */
function ExecutionTimeBadge({ nodeId }: { nodeId: string }) {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const times = useSelector(editor.execution, (s) =>
    s.nodeExecutionTimes.get(nodeId),
  );
  if (!times || times.length === 0) return null;

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const display = avg < 1 ? "<1ms" : `${Math.round(avg)}ms`;
  const colorClass =
    avg < 1
      ? "text-success"
      : avg < 10
        ? "text-warning-muted"
        : avg < 100
          ? "text-warning-strong"
          : "text-destructive";
  const details = t("scripts.editor.node.avgTime", {
    avg: avg.toFixed(2),
    count: times.length,
  });

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label={t("scripts.editor.node.avgTimeBadge", { display })}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        render={
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the component renders its children inside this button, which gives it its text label
          <button
            type="button"
            className={cn(
              "bg-muted/50 px-1 font-mono text-3xs",
              colorClass,
              NODE_BADGE_CLASS,
            )}
          />
        }
      >
        {display}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto max-w-64">
        <PopoverTitle>{details}</PopoverTitle>
      </PopoverContent>
    </Popover>
  );
}

const EMPTY_EDGES: Edge[] = [];

// Get port label from server-provided definition
const getPortLabel = (port: PortDefinition): string => port.label;

function BaseNodeComponent({
  id,
  data,
  definition,
  selected,
  edges = EMPTY_EDGES,
  onDataChange,
  typeBindings,
}: BaseNodeProps) {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const { inputs, outputs, label, color, supportsMuting } = definition;
  const reorderMultiInputEdges = editor.actions.reorderMultiInputEdges;
  const { getNode } = useReactFlow();

  // Compute resolved port type for a given port using type bindings
  const getResolvedType = useCallback(
    (port: PortDefinition): PortType | undefined => {
      if (
        !typeBindings ||
        typeBindings.size === 0 ||
        !port.typeDescriptor ||
        !hasTypeVariables(port.typeDescriptor)
      ) {
        return undefined;
      }
      const resolved = getResolvedPortType(port, typeBindings);
      return resolved !== port.type ? resolved : undefined;
    },
    [typeBindings],
  );

  // Handler for toggling collapsed state
  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onDataChange) return;
      onDataChange({ collapsed: !data.collapsed });
    },
    [onDataChange, data.collapsed],
  );

  // Handler for label rename - stable callback so EditableNodeLabel memo works
  const handleLabelSubmit = useCallback(
    (newLabel: string) => {
      onDataChange?.({ label: newLabel });
    },
    [onDataChange],
  );

  // Preview state from store
  const previewEnabled = useSelector(editor.ui, (s) =>
    s.previewEnabledNodes.has(id),
  );
  const previewValues = useSelector(
    editor.execution,
    (s) => s.previewValues.get(id) ?? EMPTY_PREVIEW_VALUES,
  );

  // Use data.label override or server-provided label
  const displayLabel = data.label ?? label;
  const isActive = useSelector(
    editor.execution,
    (state) => state.activeNodeId === id,
  );
  const isMuted = data.muted ?? false;
  const isCollapsed = data.collapsed ?? false;
  const hiddenSockets = data.hiddenSockets ?? NO_HIDDEN_SOCKETS;
  const hideUnconnected = hiddenSockets.includes("__hide_unconnected__");

  // Compute which input ports are connected
  const connectedInputs = useMemo(() => {
    const connected = new Set<string>();
    for (const edge of edges) {
      if (edge.target === id && edge.targetHandle) {
        connected.add(edge.targetHandle);
      }
    }
    return connected;
  }, [edges, id]);

  const multiInputItemsByPort = useMemo(() => {
    const itemsByPort = new Map<
      string,
      {
        id: string;
        index: number;
        label: string;
        sublabel?: string | undefined;
      }[]
    >();

    for (const edge of edges) {
      if (edge.target !== id || !edge.targetHandle) continue;

      const port = inputs.find((input) => input.id === edge.targetHandle);
      if (!port?.multiInput) continue;

      const sourceNode = getNode(edge.source);
      const sourceLabel =
        nodeDataString(sourceNode?.data, "label") ??
        getNodeDefinition(sourceNode?.type ?? "")?.label ??
        "Node";
      const sourcePort = sourceNode?.type
        ? getPortDefinition(sourceNode.type, edge.sourceHandle ?? "")
        : undefined;
      const list = itemsByPort.get(edge.targetHandle) ?? [];
      list.push({
        id: edge.id,
        index: ((edge.data as { order?: number } | undefined)?.order ?? 0) + 1,
        label: sourceLabel,
        sublabel: sourcePort?.label,
      });
      itemsByPort.set(edge.targetHandle, list);
    }

    // The items were built above, so renumbering them in place is safe.
    for (const items of itemsByPort.values()) {
      items.sort((a, b) => a.index - b.index);
      for (const [index, item] of items.entries()) {
        item.index = index + 1;
      }
    }

    return itemsByPort;
  }, [edges, getNode, id, inputs]);

  // Compute which output ports are connected
  const connectedOutputs = useMemo(() => {
    const connected = new Set<string>();
    for (const edge of edges) {
      if (edge.source === id && edge.sourceHandle) {
        connected.add(edge.sourceHandle);
      }
    }
    return connected;
  }, [edges, id]);

  // Filter inputs based on socket visibility
  const visibleInputs = useMemo(
    () =>
      inputs.filter((input) => {
        // Always show connected sockets
        if (connectedInputs.has(input.id)) return true;
        // Hide if explicitly hidden
        if (hiddenSockets.includes(input.id)) return false;
        // Hide unconnected if flag is set
        if (hideUnconnected) return false;
        return true;
      }),
    [inputs, connectedInputs, hiddenSockets, hideUnconnected],
  );

  // Filter outputs based on socket visibility
  const visibleOutputs = useMemo(
    () =>
      outputs.filter((output) => {
        // Always show connected sockets
        if (connectedOutputs.has(output.id)) return true;
        // Hide if explicitly hidden
        if (hiddenSockets.includes(output.id)) return false;
        // Hide unconnected if flag is set
        if (hideUnconnected) return false;
        return true;
      }),
    [outputs, connectedOutputs, hiddenSockets, hideUnconnected],
  );

  // Handler for inline value changes
  const handleValueChange = useCallback(
    (portId: string, value: unknown) => {
      if (!onDataChange) return;
      const fieldKey = getFieldKey(portId);
      onDataChange({ [fieldKey]: value });
    },
    [onDataChange],
  );

  // Pair up visible inputs and outputs for aligned rows
  const maxPorts = Math.max(visibleInputs.length, visibleOutputs.length);
  const rows = Array.from({ length: maxPorts }, (_, i) => ({
    input: visibleInputs[i],
    output: visibleOutputs[i],
  }));

  // Use node color from server, or fall back to default gray
  const borderStyle = color ? { borderLeftColor: color } : undefined;
  const borderClass = color ? "" : "border-l-muted-foreground";

  return (
    <div
      className={cn(
        "min-w-[160px] rounded-lg border-2 border-border bg-card shadow-md",
        "border-l-4",
        borderClass,
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isActive && "ring-2 ring-success ring-offset-2 ring-offset-background",
        isMuted && "opacity-50 grayscale",
      )}
      style={borderStyle}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          !isCollapsed && "border-b border-border/50",
        )}
      >
        {/* Collapse toggle button */}
        {rows.length > 0 && (
          <button
            type="button"
            onClick={handleToggleCollapse}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            className="nodrag nopan -m-0.5 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            title={
              isCollapsed
                ? t("scripts.editor.node.expand")
                : t("scripts.editor.node.collapse")
            }
          >
            {isCollapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
        )}
        <EditableNodeLabel
          nodeId={id}
          value={displayLabel}
          onSubmit={handleLabelSubmit}
          variant={isMuted ? "muted" : "default"}
        />
        {isMuted && supportsMuting && (
          <span className="text-xs text-muted-foreground">
            {t("scripts.editor.node.muted")}
          </span>
        )}
        <ValidationBadges nodeId={id} />
        <ExecutionTimeBadge nodeId={id} />
      </div>

      {/* Ports - hidden when collapsed, but still render handles */}
      {isCollapsed ? (
        // When collapsed, render handles positioned at edges
        <div className="relative h-4">
          {visibleInputs.map((input) => (
            <PortRow
              key={input.id}
              port={input}
              type="target"
              position={Position.Left}
              translatedLabel=""
              collapsed
              isConnected={connectedInputs.has(input.id)}
              resolvedType={getResolvedType(input)}
            />
          ))}
          {visibleOutputs.map((output) => (
            <PortRow
              key={output.id}
              port={output}
              type="source"
              position={Position.Right}
              translatedLabel=""
              collapsed
              isConnected={connectedOutputs.has(output.id)}
              resolvedType={getResolvedType(output)}
            />
          ))}
        </div>
      ) : (
        rows.length > 0 && (
          <div className="p-1">
            {rows.map(({ input, output }) => (
              <div
                key={`${input?.id ?? "empty"}-${output?.id ?? "empty"}`}
                className="flex items-center justify-between"
              >
                {/* Input port */}
                {input ? (
                  <PortRow
                    port={input}
                    type="target"
                    position={Position.Left}
                    translatedLabel={getPortLabel(input)}
                    isConnected={connectedInputs.has(input.id)}
                    value={data[getFieldKey(input.id)]}
                    onValueChange={(val) => {
                      handleValueChange(input.id, val);
                    }}
                    resolvedType={getResolvedType(input)}
                    multiInputItems={
                      multiInputItemsByPort.get(input.id) ??
                      EMPTY_MULTI_INPUT_ITEMS
                    }
                    onReorderMultiInput={(orderedEdgeIds) => {
                      reorderMultiInputEdges(id, input.id, orderedEdgeIds);
                    }}
                  />
                ) : (
                  <div />
                )}

                {/* Output port */}
                {output ? (
                  <PortRow
                    port={output}
                    type="source"
                    position={Position.Right}
                    translatedLabel={getPortLabel(output)}
                    isConnected={connectedOutputs.has(output.id)}
                    resolvedType={getResolvedType(output)}
                  />
                ) : (
                  <div />
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Node Preview - shows output values during execution */}
      {!isCollapsed && (
        <NodePreview values={previewValues} enabled={previewEnabled} />
      )}

      {/* Muted pass-through indicator */}
      {isMuted && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-0.5 w-full bg-destructive/50" />
        </div>
      )}
    </div>
  );
}

// Create a memoized version for better performance
export const BaseNode = memo(BaseNodeComponent);

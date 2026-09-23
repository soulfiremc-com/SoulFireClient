import { useSelector } from "@tanstack/react-store";
import {
  type Edge,
  Handle,
  type NodeProps,
  Position,
  useReactFlow,
} from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import { cn } from "@/lib/utils";
import { EMPTY_DIAGNOSTICS } from "@/stores/script-editor-derived";
import { MultiInputOrderList } from "../MultiInputOrderList";
import { useNodeEditing } from "../NodeEditingContext";
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
  resolveNodeTypeVars,
  simpleType,
  type TypeDescriptor,
} from "./types";

// Stable empty object to avoid creating new references in selectors
const EMPTY_PREVIEW_VALUES: Record<string, unknown> = {};
const EMPTY_MULTI_INPUT_ITEMS: Array<{
  id: string;
  index: number;
  label: string;
  sublabel?: string;
}> = [];

export interface BaseNodeData {
  label?: string;
  isActive?: boolean;
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
  typeBindings?: Map<string, TypeDescriptor>;
}

/**
 * Get the field key from a port ID.
 * Port IDs are now simple names (e.g., "interval", "message"),
 * so we just return the port ID directly.
 */
function getFieldKey(portId: string): string {
  return portId;
}

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
  resolvedType?: PortType;
  multiInputItems?: Array<{
    id: string;
    index: number;
    label: string;
    sublabel?: string;
  }>;
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
  multiInputItems = [],
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
        className="!absolute transition-transform hover:scale-125"
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
        isLeft ? "pr-2" : "pl-2 flex-row-reverse",
      )}
    >
      <Handle
        type={type}
        position={position}
        id={port.id}
        className="!relative !top-0 !transform-none transition-transform hover:scale-125"
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
            ? `Multi-input: accepts multiple connections${port.description ? ` (${port.description})` : ""}`
            : port.description || undefined
        }
      />

      {showInlineEditor && onValueChange ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">
            {translatedLabel}
          </span>
          <InlineEditor
            type={port.type}
            value={value}
            defaultValue={
              port.defaultValue ? JSON.parse(port.defaultValue) : undefined
            }
            onChange={onValueChange}
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
                emptyLabel={`Connect values to ${translatedLabel}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ValidationBadges({ nodeId }: { nodeId: string }) {
  const editor = useScriptEditor();
  const diagnostics = useSelector(
    editor.validation,
    (s) => s.diagnosticsByNode.get(nodeId) ?? EMPTY_DIAGNOSTICS,
  );
  if (diagnostics.length === 0) return null;

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  return (
    <div className="flex items-center gap-0.5">
      {errors.length > 0 && (
        <span
          className="flex items-center justify-center size-4 rounded-full bg-destructive text-white text-4xs font-bold"
          title={errors.map((d) => d.message).join("\n")}
        >
          {errors.length}
        </span>
      )}
      {warnings.length > 0 && (
        <span
          className="flex items-center justify-center size-4 rounded-full bg-warning-muted text-white text-4xs font-bold"
          title={warnings.map((d) => d.message).join("\n")}
        >
          {warnings.length}
        </span>
      )}
    </div>
  );
}

function ExecutionTimeBadge({ nodeId }: { nodeId: string }) {
  const editor = useScriptEditor();
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

  return (
    <span
      className={`text-3xs font-mono ${colorClass} bg-muted/50 px-1 rounded`}
      title={`Avg execution time: ${avg.toFixed(2)}ms (last ${times.length} runs)`}
    >
      {display}
    </span>
  );
}

function BaseNodeComponent({
  id,
  data,
  definition,
  selected,
  edges = [],
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
  const isActive = data.isActive ?? false;
  const isMuted = data.muted ?? false;
  const isCollapsed = data.collapsed ?? false;
  const hiddenSockets = data.hiddenSockets ?? [];
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
      Array<{ id: string; index: number; label: string; sublabel?: string }>
    >();

    for (const edge of edges) {
      if (edge.target !== id || !edge.targetHandle) continue;

      const port = inputs.find((input) => input.id === edge.targetHandle);
      if (!port?.multiInput) continue;

      const sourceNode = getNode(edge.source);
      const sourceLabel =
        (sourceNode?.data?.label as string | undefined) ??
        getNodeDefinition(sourceNode?.type ?? "")?.label ??
        "Node";
      const sourcePort = sourceNode?.type
        ? getPortDefinition(sourceNode.type, edge.sourceHandle ?? "")
        : undefined;
      const list = itemsByPort.get(edge.targetHandle) ?? [];
      list.push({
        id: edge.id,
        index:
          Number((edge.data as { order?: number } | undefined)?.order ?? 0) + 1,
        label: sourceLabel,
        sublabel: sourcePort?.label,
      });
      itemsByPort.set(edge.targetHandle, list);
    }

    for (const [portId, items] of itemsByPort) {
      items.sort((a, b) => a.index - b.index);
      itemsByPort.set(
        portId,
        items.map((item, index) => ({ ...item, index: index + 1 })),
      );
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
  const visibleInputs = useMemo(() => {
    return inputs.filter((input) => {
      // Always show connected sockets
      if (connectedInputs.has(input.id)) return true;
      // Hide if explicitly hidden
      if (hiddenSockets.includes(input.id)) return false;
      // Hide unconnected if flag is set
      if (hideUnconnected) return false;
      return true;
    });
  }, [inputs, connectedInputs, hiddenSockets, hideUnconnected]);

  // Filter outputs based on socket visibility
  const visibleOutputs = useMemo(() => {
    return outputs.filter((output) => {
      // Always show connected sockets
      if (connectedOutputs.has(output.id)) return true;
      // Hide if explicitly hidden
      if (hiddenSockets.includes(output.id)) return false;
      // Hide unconnected if flag is set
      if (hideUnconnected) return false;
      return true;
    });
  }, [outputs, connectedOutputs, hiddenSockets, hideUnconnected]);

  // Get port label from server-provided definition
  const getPortLabel = (port: PortDefinition): string => {
    return port.label;
  };

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
          "px-3 py-2 flex items-center gap-2",
          !isCollapsed && "border-b border-border/50",
        )}
      >
        {/* Collapse toggle button */}
        {rows.length > 0 && (
          <button
            type="button"
            onClick={handleToggleCollapse}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag nopan text-muted-foreground hover:text-foreground transition-colors p-0.5 -m-0.5 rounded hover:bg-muted/50"
            title={
              isCollapsed
                ? t("scripts.editor.node.expand")
                : t("scripts.editor.node.collapse")
            }
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}
        <EditableNodeLabel
          nodeId={id}
          value={displayLabel}
          onSubmit={handleLabelSubmit}
          className={cn("text-sm font-medium", isMuted && "line-through")}
        />
        {isMuted && supportsMuting && (
          <span className="text-xs text-muted-foreground">(muted)</span>
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
          <div className="px-1 py-1">
            {rows.map((row) => (
              <div
                key={`${row.input?.id ?? "empty"}-${row.output?.id ?? "empty"}`}
                className="flex items-center justify-between"
              >
                {/* Input port */}
                {row.input ? (
                  <PortRow
                    port={row.input}
                    type="target"
                    position={Position.Left}
                    translatedLabel={getPortLabel(row.input)}
                    isConnected={connectedInputs.has(row.input.id)}
                    value={data[getFieldKey(row.input.id)]}
                    onValueChange={(val) =>
                      handleValueChange(row.input.id, val)
                    }
                    resolvedType={getResolvedType(row.input)}
                    multiInputItems={
                      multiInputItemsByPort.get(row.input.id) ??
                      EMPTY_MULTI_INPUT_ITEMS
                    }
                    onReorderMultiInput={(orderedEdgeIds) =>
                      reorderMultiInputEdges(id, row.input.id, orderedEdgeIds)
                    }
                  />
                ) : (
                  <div />
                )}

                {/* Output port */}
                {row.output ? (
                  <PortRow
                    port={row.output}
                    type="source"
                    position={Position.Right}
                    translatedLabel={getPortLabel(row.output)}
                    isConnected={connectedOutputs.has(row.output.id)}
                    resolvedType={getResolvedType(row.output)}
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
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="h-0.5 w-full bg-destructive/50" />
        </div>
      )}
    </div>
  );
}

// Create a memoized version for better performance
export const BaseNode = memo(BaseNodeComponent);

// Check if a node definition has any ports with type variables
function definitionHasTypeVars(def: NodeDefinition): boolean {
  return (
    def.inputs.some(
      (p) => p.typeDescriptor && hasTypeVariables(p.typeDescriptor),
    ) ||
    def.outputs.some(
      (p) => p.typeDescriptor && hasTypeVariables(p.typeDescriptor),
    )
  );
}

// Factory function to create node components from definitions
// Uses NodeEditingContext for inline editing capabilities
export function createNodeComponent(definition: NodeDefinition) {
  const hasGenericPorts = definitionHasTypeVars(definition);

  const NodeComponent = (props: NodeProps) => {
    const { edges, updateNodeData } = useNodeEditing();
    const { getNodes } = useReactFlow();

    const handleDataChange = useCallback(
      (data: Record<string, unknown>) => {
        updateNodeData(props.id, data);
      },
      [props.id, updateNodeData],
    );

    const nodeData = props.data as BaseNodeData;

    // Compute type variable bindings for generic nodes
    const typeBindings = useMemo(() => {
      if (!hasGenericPorts) return undefined;

      const connectedInputTypes = new Map<string, TypeDescriptor>();
      const allNodes = getNodes();

      for (const edge of edges) {
        if (
          edge.target !== props.id ||
          !edge.targetHandle ||
          !edge.sourceHandle
        )
          continue;

        // Find the source node to get its type
        const sourceNode = allNodes.find((n) => n.id === edge.source);
        if (!sourceNode?.type) continue;

        // Look up the source port's type descriptor
        const srcPortDef = getPortDefinition(
          sourceNode.type,
          edge.sourceHandle,
        );
        if (srcPortDef?.typeDescriptor) {
          connectedInputTypes.set(edge.targetHandle, srcPortDef.typeDescriptor);
        } else if (srcPortDef) {
          connectedInputTypes.set(
            edge.targetHandle,
            simpleType(srcPortDef.type),
          );
        }
      }

      if (connectedInputTypes.size === 0) return undefined;

      const bindings = resolveNodeTypeVars(
        definition.type,
        connectedInputTypes,
      );
      return bindings.size > 0 ? bindings : undefined;
    }, [edges, props.id, getNodes]);

    return (
      <BaseNode
        {...props}
        definition={definition}
        data={nodeData}
        edges={edges}
        onDataChange={handleDataChange}
        typeBindings={typeBindings}
      />
    );
  };
  NodeComponent.displayName = `${definition.type}Node`;
  return memo(NodeComponent);
}

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Layers } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getHandleShape, getPortColor, type PortType } from "./types";

export interface GroupNodeData {
  /** The name of the group. Imported scripts can omit it. */
  label?: string | null | undefined;
  /** The ID of the node group definition this references */
  groupId?: string;
  /** Exposed input sockets */
  inputs?: { id: string; type: PortType; label: string }[];
  /** Exposed output sockets */
  outputs?: { id: string; type: PortType; label: string }[];
  /** Whether the group is collapsed */
  collapsed?: boolean;
  [key: string]: unknown;
}

interface GroupNodeProps extends NodeProps {
  data: GroupNodeData;
}

function PortRow({
  port,
  type,
  position,
}: {
  port: { id: string; type: PortType; label: string };
  type: "source" | "target";
  position: Position;
}) {
  const color = getPortColor(port.type);
  const handleShape = getHandleShape(port.type);
  const isLeft = position === Position.Left;

  // Calculate handle dimensions based on shape (data-driven)
  const isSquareOrDiamond =
    handleShape === "square" || handleShape === "diamond";
  const handleWidth = isSquareOrDiamond ? 10 : 8;
  const handleHeight = isSquareOrDiamond ? 10 : 8;
  const handleBorderRadius = isSquareOrDiamond ? 2 : "50%";

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 py-1",
        isLeft ? "pr-4" : "flex-row-reverse pl-4",
      )}
    >
      <Handle
        type={type}
        position={position}
        id={port.id}
        className="relative! top-0! transform-none! transition-transform hover:scale-125"
        style={{
          background: color,
          width: handleWidth,
          height: handleHeight,
          border: "2px solid var(--background)",
          borderRadius: handleBorderRadius,
        }}
      />
      <span className="text-xs text-muted-foreground">{port.label}</span>
    </div>
  );
}

/**
 * Group Node - A reusable composite node containing a sub-graph.
 * Blender-style: Can be entered to edit, or used as a black box.
 */
function GroupNodeComponent({ data, selected }: GroupNodeProps) {
  const { t } = useTranslation("instance");
  const label = data.label || t("scripts.editor.group.defaultLabel");
  const inputs = data.inputs ?? [];
  const outputs = data.outputs ?? [];

  // Pair up inputs and outputs for aligned rows
  const maxPorts = Math.max(inputs.length, outputs.length);
  const rows = Array.from({ length: maxPorts }, (_, i) => ({
    input: inputs[i],
    output: outputs[i],
  }));

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border-2 bg-card shadow-md",
        "border-primary/50",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-primary/10 px-3 py-2">
        <Layers className="size-4 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>

      {/* Ports */}
      {rows.length > 0 && (
        <div className="p-1">
          {rows.map((row) => (
            <div
              key={`${row.input?.id ?? "empty"}-${row.output?.id ?? "empty"}`}
              className="flex items-center justify-between"
            >
              {row.input ? (
                <PortRow
                  port={row.input}
                  type="target"
                  position={Position.Left}
                />
              ) : (
                <div />
              )}
              {row.output ? (
                <PortRow
                  port={row.output}
                  type="source"
                  position={Position.Right}
                />
              ) : (
                <div />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer hint */}
      <div className="border-t border-border/50 px-3 py-1 text-xs text-muted-foreground">
        {t("scripts.editor.group.editHint")}
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);

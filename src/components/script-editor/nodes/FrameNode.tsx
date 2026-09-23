import { type NodeProps, NodeResizer } from "@xyflow/react";
import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useNodeEditing } from "../NodeEditingContext";
import { EditableNodeLabel } from "./EditableNodeLabel";

export interface FrameNodeData {
  /** Label displayed at the top of the frame */
  label?: string;
  /** Background color (hex) */
  color?: string;
  /** Whether the frame is locked (children can't be moved) */
  locked?: boolean;
  [key: string]: unknown;
}

interface FrameNodeProps extends NodeProps {
  data: FrameNodeData;
}

/**
 * Frame Node - A visual container for grouping related nodes.
 * Blender-style: provides organization without affecting execution.
 * Children move with the frame when it's dragged.
 */
function FrameNodeComponent({ id, data, selected }: FrameNodeProps) {
  const { updateNodeData } = useNodeEditing();
  const label = data.label ?? "Frame";
  const backgroundColor = data.color ?? "var(--muted)";

  const handleLabelSubmit = useCallback(
    (newLabel: string) => {
      updateNodeData(id, { label: newLabel });
    },
    [id, updateNodeData],
  );

  return (
    <>
      {/* Resizer handles */}
      <NodeResizer
        minWidth={200}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-none"
      />

      {/* Frame container */}
      <div
        className={cn(
          "w-full h-full rounded-lg border-2 border-dashed",
          selected ? "border-primary" : "border-border/50",
          data.locked && "cursor-not-allowed",
        )}
        style={{
          backgroundColor: `${backgroundColor}20`, // 20% opacity
          minWidth: 200,
          minHeight: 100,
        }}
      >
        {/* Frame header/label */}
        <div
          className={cn(
            "absolute -top-6 left-2 px-2 py-0.5 rounded text-sm font-medium flex items-center",
            selected ? "text-primary" : "text-muted-foreground",
          )}
          style={{
            backgroundColor: backgroundColor,
          }}
        >
          <EditableNodeLabel
            nodeId={id}
            value={label}
            onSubmit={handleLabelSubmit}
            variant={selected ? "selectedFrame" : "frame"}
          />
          {data.locked && <span className="ml-1 text-xs opacity-50">🔒</span>}
        </div>
      </div>
    </>
  );
}

export const FrameNode = memo(FrameNodeComponent);

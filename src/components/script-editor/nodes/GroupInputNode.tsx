import { Handle, type NodeProps, Position } from "@xyflow/react";
import { ArrowRightFromLine } from "lucide-react";
import { memo } from "react";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { getHandleShape, getPortColor, type PortType } from "./types";

export interface GroupInputNodeData {
  /** Output sockets that map to the group's external inputs */
  outputs?: Array<{ id: string; type: PortType; label: string }>;
  [key: string]: unknown;
}

interface GroupInputNodeProps extends NodeProps {
  data: GroupInputNodeData;
}

/**
 * Group Input Node - Defines the inputs of a node group from inside.
 * Blender-style: This node exposes values passed into the group.
 */
function GroupInputNodeComponent({ data, selected }: GroupInputNodeProps) {
  const outputs = data.outputs ?? [];

  return (
    <div
      className={cn(
        "min-w-[140px] rounded-lg border-2 bg-card shadow-md",
        "border-success/50",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-success/10 px-3 py-2">
        <ArrowRightFromLine className="h-4 w-4 text-success" />
        <span className="text-sm font-medium">Group Input</span>
      </div>

      {/* Output ports */}
      {outputs.length > 0 && (
        <div className="px-1 py-1">
          {outputs.map((output) => {
            const handleShape = getHandleShape(output.type);
            const isSquareOrDiamond =
              handleShape === "square" || handleShape === "diamond";
            return (
              <div
                key={output.id}
                className="flex items-center justify-end gap-2 py-1 pl-4"
              >
                <span className="text-xs text-muted-foreground">
                  {output.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  className="!relative !top-0 !transform-none transition-transform hover:scale-125"
                  style={{
                    background: getPortColor(output.type),
                    width: isSquareOrDiamond ? 10 : 8,
                    height: isSquareOrDiamond ? 10 : 8,
                    border: "2px solid var(--background)",
                    borderRadius: isSquareOrDiamond ? 2 : "50%",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {outputs.length === 0 && (
        <Empty className="border-0 p-3">
          <EmptyHeader className="gap-1">
            <EmptyTitle className="text-xs text-muted-foreground">
              No inputs defined
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

export const GroupInputNode = memo(GroupInputNodeComponent);

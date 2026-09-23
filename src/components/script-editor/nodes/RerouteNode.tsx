import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { getPortColor, type PortType } from "./types";

export interface RerouteNodeData {
  /** The resolved type based on connections (inherited from source) */
  resolvedType?: PortType;
  /** Optional label for the reroute */
  label?: string;
  [key: string]: unknown;
}

interface RerouteNodeProps extends NodeProps {
  data: RerouteNodeData;
}

/**
 * Reroute Node - A minimal pass-through node for organizing noodle connections.
 * Visually appears as just a colored dot that inherits its type from connections.
 * Blender-style: used to create cleaner, more organized node graphs.
 */
function RerouteNodeComponent({ data, selected }: RerouteNodeProps) {
  const resolvedType = data.resolvedType ?? "any";
  const color = getPortColor(resolvedType);

  return (
    <div className="relative">
      {/* The reroute dot */}
      <div
        className={cn(
          "w-4 h-4 rounded-full transition-all",
          selected &&
            "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
        style={{
          background: color,
          border: "2px solid var(--background)",
        }}
      />

      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!absolute !w-full !h-full !top-0 !left-0 !transform-none !bg-transparent !border-none"
      />

      {/* Output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!absolute !w-full !h-full !top-0 !left-0 !transform-none !bg-transparent !border-none"
      />

      {/* Optional label */}
      {data.label && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-xs text-muted-foreground">{data.label}</span>
        </div>
      )}
    </div>
  );
}

export const RerouteNode = memo(RerouteNodeComponent);

import {
  type ConnectionLineComponentProps,
  getBezierPath,
} from "@xyflow/react";
import { cn } from "@/lib/utils";

/** Shows whether dropping the wire on the port under the pointer works. */
export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionStatus,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  return (
    <path
      d={path}
      fill="none"
      strokeWidth={2}
      strokeDasharray={connectionStatus === "invalid" ? "6 4" : undefined}
      className={cn(
        "stroke-muted-foreground",
        connectionStatus === "valid" && "stroke-success",
        connectionStatus === "invalid" && "stroke-destructive",
      )}
    />
  );
}

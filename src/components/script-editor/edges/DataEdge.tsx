import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "any";

export type DataEdgeData = {
  dataType?: DataType;
  order?: number;
};

export type DataEdgeType = Edge<DataEdgeData, "data">;

/**
 * Color mapping for different data types
 */
const DATA_TYPE_COLORS: Record<DataType, string> = {
  string: "rgb(234, 179, 8)", // Yellow
  number: "rgb(59, 130, 246)", // Blue
  boolean: "rgb(239, 68, 68)", // Red
  object: "rgb(168, 85, 247)", // Purple
  array: "rgb(34, 197, 94)", // Green
  any: "rgb(156, 163, 175)", // Gray
};

/**
 * Get the color for a given data type
 */
function getDataTypeColor(dataType: DataType | undefined): string {
  return DATA_TYPE_COLORS[dataType ?? "any"];
}

function DataEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<DataEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = getDataTypeColor(data?.dataType);
  const hasOrder = Number.isFinite(data?.order);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(selected && "!opacity-100")}
        style={{
          stroke: color,
          strokeWidth: 1.5,
          opacity: 0.7,
        }}
      />
      {hasOrder && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <Badge
              variant={selected ? "default" : "secondary"}
              className="h-5 min-w-5 rounded-full border border-background/80 px-1 font-mono text-3xs shadow-sm"
              style={{
                backgroundColor: selected ? color : undefined,
                color: selected ? "var(--background)" : undefined,
              }}
            >
              {(data?.order ?? 0) + 1}
            </Badge>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export { DATA_TYPE_COLORS, DataEdge, getDataTypeColor };

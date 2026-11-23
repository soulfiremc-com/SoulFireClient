import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useStore,
} from "@xyflow/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getPortColor,
  getPortTypeFromDefinition,
  type PortType,
} from "../nodes/types";

// oxlint-disable-next-line typescript/consistent-type-definitions -- React Flow requires edge data to satisfy Record<string, unknown>, which an interface does not
export type DataEdgeData = {
  order?: number;
};

export type DataEdgeType = Edge<DataEdgeData, "data">;

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
  source,
  sourceHandleId,
}: EdgeProps<DataEdgeType>) {
  // The wire takes the color of the port it leaves. Reroutes keep their
  // resolved type in their data.
  const portType = useStore((state) => {
    const node = state.nodeLookup.get(source);
    if (!node) return "any";
    return (
      (sourceHandleId &&
        getPortTypeFromDefinition(node.type ?? "", sourceHandleId)) ||
      (node.data as { resolvedType?: PortType }).resolvedType ||
      "any"
    );
  });
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = getPortColor(portType);
  const hasOrder = Number.isFinite(data?.order);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(selected && "opacity-100!")}
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

export { DataEdge };

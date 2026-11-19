import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  Position,
} from "@xyflow/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

// oxlint-disable-next-line typescript/consistent-type-definitions -- React Flow requires edge data to satisfy Record<string, unknown>, which an interface does not
export type ExecutionEdgeData = {
  isActive?: boolean;
};

export type ExecutionEdgeType = Edge<ExecutionEdgeData, "execution">;

/**
 * Arrow rotation so it points into the target node based on handle position.
 */
function getArrowRotation(position: Position): number {
  switch (position) {
    case Position.Left: {
      return 0;
    }
    case Position.Right: {
      return 180;
    }
    case Position.Top: {
      return -90;
    }
    case Position.Bottom: {
      return 90;
    }
    default: {
      return position satisfies never;
    }
  }
}

function ExecutionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ExecutionEdgeType>) {
  const { t } = useTranslation("instance");
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const isActive = data?.isActive ?? false;
  const arrowRotation = getArrowRotation(targetPosition);

  return (
    <>
      <BaseEdge
        path={edgePath}
        className={cn(
          "stroke-muted-foreground!",
          isActive && "animate-pulse",
          selected && "stroke-foreground!",
        )}
        style={{
          strokeWidth: 2.5,
          strokeDasharray: isActive ? "5 5" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY}px)`,
          }}
        >
          <svg
            role="img"
            aria-label={t("scripts.editor.edge.direction")}
            width="10"
            height="10"
            viewBox="0 0 10 10"
            style={{ transform: `rotate(${arrowRotation}deg)` }}
            className={cn(
              "fill-muted-foreground",
              isActive && "animate-pulse",
              selected && "fill-foreground",
            )}
          >
            <polygon points="0,1 10,5 0,9" />
          </svg>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export { ExecutionEdge };

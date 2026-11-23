import type { XYPosition } from "@xyflow/react";
import type { EdgeShapes } from "@/lib/script-edge-geometry";

/** Sample about every 16 flow units, which is closer than a cut can miss. */
const SAMPLE_SPACING = 16;
const MAX_SAMPLES = 96;

/**
 * Reads the wires that React Flow has drawn below `root`. Each path is in
 * flow coordinates, so the samples match positions from screenToFlowPosition.
 */
export function readDrawnEdgeShapes(root: ParentNode | null): EdgeShapes {
  const shapes = new Map<string, XYPosition[]>();
  if (!root) return shapes;
  for (const group of root.querySelectorAll<SVGGElement>(
    ".react-flow__edge[data-id]",
  )) {
    const id = group.dataset["id"];
    const path = group.querySelector<SVGPathElement>(
      "path.react-flow__edge-path",
    );
    if (!id || !path) continue;
    const length = path.getTotalLength();
    const steps = Math.min(
      MAX_SAMPLES,
      Math.max(1, Math.ceil(length / SAMPLE_SPACING)),
    );
    const points: XYPosition[] = [];
    for (let i = 0; i <= steps; i++) {
      const point = path.getPointAtLength((length * i) / steps);
      points.push({ x: point.x, y: point.y });
    }
    shapes.set(id, points);
  }
  return shapes;
}

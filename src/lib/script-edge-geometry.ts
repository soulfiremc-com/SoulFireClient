import type { Edge, Node, XYPosition } from "@xyflow/react";

/** Points along each drawn wire, by edge ID, in flow coordinates. */
export type EdgeShapes = ReadonlyMap<string, readonly XYPosition[]>;

/** Distance from a point to a line segment. */
export function pointToSegmentDistance(
  p: XYPosition,
  a: XYPosition,
  b: XYPosition,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const turnDirection = (
  p1: XYPosition,
  p2: XYPosition,
  p3: XYPosition,
): number => (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);

/** Whether segment p1-p2 crosses segment p3-p4. */
export function lineSegmentsIntersect(
  p1: XYPosition,
  p2: XYPosition,
  p3: XYPosition,
  p4: XYPosition,
): boolean {
  const d1 = turnDirection(p3, p4, p1);
  const d2 = turnDirection(p3, p4, p2);
  const d3 = turnDirection(p1, p2, p3);
  const d4 = turnDirection(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** Distance from a point to the closest part of a polyline. */
export function polylineDistance(
  point: XYPosition,
  line: readonly XYPosition[],
): number {
  if (line.length === 1 && line[0]) {
    return Math.hypot(point.x - line[0].x, point.y - line[0].y);
  }
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (a && b) best = Math.min(best, pointToSegmentDistance(point, a, b));
  }
  return best;
}

/** Whether a polyline crosses the segment from start to end. */
export function polylineCrossesSegment(
  line: readonly XYPosition[],
  start: XYPosition,
  end: XYPosition,
): boolean {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (a && b && lineSegmentsIntersect(start, end, a, b)) return true;
  }
  return false;
}

// Used before React Flow has drawn a wire: from the source node's right side
// to the target node's left side, near the first sockets.
const FALLBACK_NODE_WIDTH = 80;
const FALLBACK_SOCKET_Y = 40;

/**
 * The shape of each edge. Uses the drawn wire when it is known and a straight
 * line between the nodes otherwise.
 */
export function edgeShapes(
  nodes: readonly Node[],
  edges: readonly Edge[],
  drawn?: EdgeShapes,
): Map<string, readonly XYPosition[]> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<string, readonly XYPosition[]>();
  for (const edge of edges) {
    const shape = drawn?.get(edge.id);
    if (shape && shape.length > 0) {
      result.set(edge.id, shape);
      continue;
    }
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const width = source.measured?.width ?? source.width ?? FALLBACK_NODE_WIDTH;
    result.set(edge.id, [
      {
        x: source.position.x + width,
        y: source.position.y + FALLBACK_SOCKET_Y,
      },
      { x: target.position.x, y: target.position.y + FALLBACK_SOCKET_Y },
    ]);
  }
  return result;
}

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  edgeShapes,
  polylineCrossesSegment,
  polylineDistance,
} from "./script-edge-geometry";

// A wire that bends down and back, like a bezier between offset sockets.
const bent = [
  { x: 0, y: 0 },
  { x: 50, y: 100 },
  { x: 100, y: 0 },
];

test("a cut crosses a bent wire where it is drawn, not on the chord", () => {
  assert.equal(
    polylineCrossesSegment(bent, { x: 20, y: 60 }, { x: 40, y: 60 }),
    true,
  );
  // This cut crosses the straight line between the ends, but not the wire.
  assert.equal(
    polylineCrossesSegment(bent, { x: 50, y: -10 }, { x: 50, y: 10 }),
    false,
  );
});

test("distance follows the drawn wire", () => {
  assert.equal(polylineDistance({ x: 50, y: 110 }, bent), 10);
});

test("edges without a drawn wire use the measured source width", () => {
  const nodes: Node[] = [
    {
      id: "a",
      position: { x: 0, y: 0 },
      data: {},
      measured: { width: 300, height: 100 },
    },
    { id: "b", position: { x: 500, y: 0 }, data: {} },
  ];
  const edges: Edge[] = [
    { id: "drawn", source: "a", target: "b" },
    { id: "guessed", source: "a", target: "b" },
  ];
  const shapes = edgeShapes(nodes, edges, new Map([["drawn", bent]]));
  assert.equal(shapes.get("drawn"), bent);
  assert.deepEqual(shapes.get("guessed"), [
    { x: 300, y: 40 },
    { x: 500, y: 40 },
  ]);
});

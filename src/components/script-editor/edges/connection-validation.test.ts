import assert from "node:assert/strict";
import { test } from "node:test";
import type { Node } from "@xyflow/react";
import { getConnectionProblem } from "./connection-validation";

const reroute = (id: string, resolvedType: string): Node => ({
  id,
  type: "layout.reroute",
  position: { x: 0, y: 0 },
  data: { resolvedType },
});

const connect = (source: string, target: string) => ({
  source,
  sourceHandle: "out",
  target,
  targetHandle: "in",
});

test("connections explain self wiring and execution mismatches", () => {
  const nodes = [
    reroute("flow", "execution"),
    reroute("next", "execution"),
    reroute("number", "number"),
    reroute("other", "number"),
  ];
  assert.equal(getConnectionProblem(nodes, connect("flow", "next")), null);
  assert.equal(getConnectionProblem(nodes, connect("number", "other")), null);
  assert.deepEqual(getConnectionProblem(nodes, connect("flow", "flow")), {
    kind: "self",
  });
  assert.deepEqual(getConnectionProblem(nodes, connect("number", "flow")), {
    kind: "execution",
    sourceType: "number",
    targetType: "execution",
  });
});

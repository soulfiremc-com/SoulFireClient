import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { debugSources, outputKey } from "./script-debug-sources";

const node = (id: string, type: string, parentGroupId?: string): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: parentGroupId ? { parentGroupId } : {},
});

const edge = (
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge => ({
  id: `${source}.${sourceHandle}-${target}.${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

test("debug nodes see outputs through reroutes and other debug nodes", () => {
  const sources = debugSources(
    [
      node("value", "math.add"),
      node("reroute", "layout.reroute"),
      node("first", "layout.debug"),
      node("second", "layout.debug"),
    ],
    [
      edge("value", "result", "reroute", "in"),
      edge("reroute", "out", "first", "in"),
      edge("first", "out", "second", "in"),
    ],
  );
  assert.deepEqual(sources.get(outputKey("value", "result")), [
    "first",
    "second",
  ]);
  assert.equal(sources.size, 1);
});

test("debug nodes see outputs through group interfaces", () => {
  const sources = debugSources(
    [
      node("outside", "math.add"),
      node("group", "layout.group"),
      node("input", "layout.group_input", "group"),
      node("inner", "math.add", "group"),
      node("output", "layout.group_output", "group"),
      node("insideDebug", "layout.debug", "group"),
      node("outsideDebug", "layout.debug"),
    ],
    [
      edge("outside", "result", "group", "a"),
      edge("input", "a", "insideDebug", "in"),
      edge("inner", "result", "output", "b"),
      edge("group", "b", "outsideDebug", "in"),
    ],
  );
  assert.deepEqual(sources.get(outputKey("outside", "result")), [
    "insideDebug",
  ]);
  assert.deepEqual(sources.get(outputKey("inner", "result")), ["outsideDebug"]);
});

test("cycles through pass-through nodes end", () => {
  const sources = debugSources(
    [node("a", "layout.reroute"), node("b", "layout.debug")],
    [edge("a", "out", "b", "in"), edge("b", "out", "a", "in")],
  );
  assert.equal(sources.size, 0);
});

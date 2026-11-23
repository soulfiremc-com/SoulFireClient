import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  initNodeDefinitions,
  type NodeDefinition,
  type PortDefinition,
  type PortType,
} from "@/components/script-editor/nodes/types";
import {
  connectEdge,
  createFrame,
  insertNodeOnEdge,
  isSingleWireInput,
  normalizeScriptGraph,
  reconnectEdge,
  ungroup,
} from "./script-graph-ops";

const port = (
  id: string,
  type: PortType,
  multiInput?: boolean,
): PortDefinition => ({ id, label: id, type, multiInput });

const definition = (
  type: string,
  inputs: PortDefinition[],
  outputs: PortDefinition[],
): NodeDefinition => ({
  type,
  label: type,
  category: "test",
  icon: "",
  inputs,
  outputs,
});

beforeEach(() => {
  initNodeDefinitions([
    definition(
      "action.step",
      [port("in", "execution"), port("value", "number")],
      [port("out", "execution"), port("result", "number")],
    ),
    definition(
      "list.create",
      [port("items", "number", true)],
      [port("list", "list")],
    ),
  ]);
});

afterEach(() => {
  initNodeDefinitions([]);
});

const node = (id: string, type: string, parentGroupId?: string): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: parentGroupId ? { parentGroupId } : {},
});

const wire = (
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
) => ({ source, sourceHandle, target, targetHandle });

const ends = (edges: Edge[]) =>
  edges.map(
    (e) => `${e.source}.${e.sourceHandle}>${e.target}.${e.targetHandle}`,
  );

const nodes = [
  node("a", "action.step"),
  node("b", "action.step"),
  node("c", "action.step"),
  node("list", "list.create"),
];

test("execution inputs keep every wire, while data inputs keep the newest", () => {
  let edges = connectEdge(nodes, [], wire("a", "out", "c", "in"));
  edges = connectEdge(nodes, edges, wire("b", "out", "c", "in"));
  assert.deepEqual(ends(edges), ["a.out>c.in", "b.out>c.in"]);
  assert.ok(edges.every((e) => e.type === "execution"));

  edges = connectEdge(nodes, edges, wire("a", "result", "c", "value"));
  edges = connectEdge(nodes, edges, wire("b", "result", "c", "value"));
  assert.deepEqual(ends(edges), [
    "a.out>c.in",
    "b.out>c.in",
    "b.result>c.value",
  ]);
  assert.equal(edges.at(-1)?.type, "data");
  assert.equal(edges.at(-1)?.data?.["order"], undefined);

  assert.equal(isSingleWireInput(nodes, "c", "in"), false);
  assert.equal(isSingleWireInput(nodes, "c", "value"), true);
  assert.equal(isSingleWireInput(nodes, "list", "items"), false);
});

test("a repeated wire is not added twice", () => {
  const edges = connectEdge(nodes, [], wire("a", "out", "b", "in"));
  assert.equal(connectEdge(nodes, edges, wire("a", "out", "b", "in")), edges);
});

test("reconnecting keeps one wire per ID and the multi-input order", () => {
  let edges = connectEdge(nodes, [], wire("a", "result", "list", "items"));
  edges = connectEdge(nodes, edges, wire("b", "result", "list", "items"));
  const [first] = edges;
  assert.ok(first);

  // Moving the first wire's source keeps its place on the same port.
  edges = reconnectEdge(
    nodes,
    edges,
    first,
    wire("c", "result", "list", "items"),
  );
  assert.equal(new Set(edges.map((e) => e.id)).size, edges.length);
  assert.deepEqual(
    edges
      .toSorted((x, y) => Number(x.data?.["order"]) - Number(y.data?.["order"]))
      .map((e) => [e.id === first.id, e.source]),
    [
      [true, "c"],
      [false, "b"],
    ],
  );

  // Moving onto an occupied single input replaces the wire there.
  edges = connectEdge(nodes, edges, wire("a", "result", "c", "value"));
  const moved = edges.find((e) => e.source === "b");
  assert.ok(moved);
  edges = reconnectEdge(nodes, edges, moved, wire("b", "result", "c", "value"));
  assert.deepEqual(ends(edges).toSorted(), [
    "b.result>c.value",
    "c.result>list.items",
  ]);
  assert.equal(edges.find((e) => e.target === "list")?.data?.["order"], 0);
  assert.equal(edges.find((e) => e.target === "c")?.data?.["order"], undefined);
});

test("wires from a group's execution port are execution wires", () => {
  const group: Node = {
    ...node("group", "layout.group"),
    data: {
      inputs: [],
      outputs: [{ id: "group-out-0", type: "execution", label: "out" }],
    },
  };
  const edges = connectEdge(
    [...nodes, group],
    [],
    wire("group", "group-out-0", "a", "in"),
  );
  assert.equal(edges[0]?.type, "execution");
});

test("inserting a node on a wire keeps the order only on the multi-input side", () => {
  const graph = {
    nodes: [...nodes, node("d", "action.step")],
    edges: [
      {
        id: "item",
        source: "a",
        sourceHandle: "result",
        target: "list",
        targetHandle: "items",
        type: "data",
        data: { edgeType: "data", order: 0 },
      },
    ],
  };
  const result = insertNodeOnEdge(graph, "d", "item");
  assert.ok(result);
  assert.deepEqual(
    result.edges.map((e) => [ends([e])[0], e.data?.["order"]]),
    [
      ["a.result>d.value", undefined],
      ["d.result>list.items", 0],
    ],
  );
});

test("ungrouping removes orders that only applied inside the group", () => {
  const result = ungroup(
    {
      nodes: [
        node("a", "action.step"),
        node("group", "layout.group"),
        node("input", "layout.group_input", "group"),
        node("b", "action.step", "group"),
      ],
      edges: [
        {
          id: "outer",
          source: "a",
          sourceHandle: "out",
          target: "group",
          targetHandle: "group-in-0",
          type: "execution",
          data: { edgeType: "execution", order: 4 },
        },
        {
          id: "inner",
          source: "input",
          sourceHandle: "group-in-0",
          target: "b",
          targetHandle: "in",
          type: "execution",
          data: { edgeType: "execution", order: 2 },
        },
      ],
    },
    "group",
  );
  assert.ok(result);
  assert.deepEqual(ends(result.edges), ["a.out>b.in"]);
  assert.equal(result.edges[0]?.data?.["order"], undefined);
  assert.equal(
    "parentGroupId" in (result.nodes.find((n) => n.id === "b")?.data ?? {}),
    false,
  );
});

test("frames only enclose nodes on the given canvas", () => {
  const frame = createFrame(
    [
      { ...node("root", "action.step"), position: { x: 0, y: 0 } },
      {
        ...node("inner", "action.step", "group"),
        position: { x: 900, y: 900 },
      },
    ],
    ["root", "inner"],
    null,
  );
  assert.ok(frame);
  assert.deepEqual(frame.position, { x: -40, y: -40 });
  assert.equal(frame.width, 240);
  assert.equal(frame.height, 180);
  assert.equal(
    createFrame([node("inner", "x", "group")], ["inner"], null),
    null,
  );
});

test("loading repairs nodes left behind by a deleted group", () => {
  const graph = normalizeScriptGraph({
    nodes: [
      node("orphan", "action.step", "missing"),
      node("lost-input", "layout.group_input", "missing"),
      node("not-a-group", "action.step", "orphan"),
      node("loop-a", "layout.group", "loop-b"),
      node("loop-b", "layout.group", "loop-a"),
      node("inside", "action.step", "loop-b"),
      {
        ...node("frame", "layout.frame"),
        data: { containedNodes: ["orphan"], label: "Frame" },
      },
    ],
    edges: [
      { id: "lost", source: "lost-input", target: "orphan" },
      { id: "gone", source: "orphan", target: "deleted" },
      {
        id: "kept",
        source: "orphan",
        sourceHandle: "out",
        target: "not-a-group",
        targetHandle: "in",
        data: { order: 3 },
      },
    ],
  });
  const parents = new Map(
    graph.nodes.map((n) => [n.id, n.data["parentGroupId"] ?? null]),
  );
  assert.deepEqual(Object.fromEntries(parents), {
    orphan: null,
    "not-a-group": null,
    "loop-a": "loop-b",
    "loop-b": null,
    inside: "loop-b",
    frame: null,
  });
  assert.deepEqual(graph.nodes.find((n) => n.id === "frame")?.data, {
    label: "Frame",
  });
  assert.deepEqual(
    graph.edges.map((e) => [e.id, e.data?.["order"]]),
    [["kept", undefined]],
  );
});

test("loading returns a sound graph unchanged", () => {
  const graph = {
    nodes: [node("a", "action.step"), node("b", "action.step")],
    edges: connectEdge(nodes, [], wire("a", "out", "b", "in")),
  };
  assert.equal(normalizeScriptGraph(graph), graph);
});

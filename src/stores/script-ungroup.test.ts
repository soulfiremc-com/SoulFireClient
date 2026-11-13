import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { parseScriptFile, serializeScriptFile } from "@/lib/script-file";
import { createScriptEditorSession } from "./script-editor-store";

function node(id: string, type: string, parentGroupId?: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: { parentGroupId } };
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  order?: number,
): Edge {
  return { id, source, sourceHandle, target, targetHandle, data: { order } };
}

function ungroup(nodes: Node[], edges: Edge[]) {
  const editor = createScriptEditorSession();
  editor.actions.loadScriptData({ nodes, edges, quotas: undefined });
  editor.actions.setSelectedNode("group");
  editor.actions.ungroupSelected();
  const graph = editor.actions.getScriptData();
  assert.equal(new Set(graph.edges.map((e) => e.id)).size, graph.edges.length);
  assert.ok(
    graph.edges.every(
      (e) =>
        graph.nodes.some((n) => n.id === e.source) &&
        graph.nodes.some((n) => n.id === e.target),
    ),
  );
  assert.equal(
    parseScriptFile(serializeScriptFile(graph)).edges.length,
    graph.edges.length,
  );
  return graph;
}

test("grouping and ungrouping restores node positions and graph connections", () => {
  const editor = createScriptEditorSession();
  const first = editor.actions.addNode("action.print", { x: -300, y: 100 });
  const second = editor.actions.addNode("action.print", { x: 100, y: -200 });
  editor.actions.onConnect({
    source: first,
    sourceHandle: "out",
    target: second,
    targetHandle: "in",
  });
  const original = editor.actions.getScriptData();
  editor.actions.onNodesChange(
    [first, second].map((id) => ({ id, type: "select", selected: true })),
  );
  editor.actions.createGroupFromSelection();
  const group = editor.document
    .get()
    .nodes.find((n) => n.type === "layout.group")!;
  editor.actions.setSelectedNode(group.id);
  editor.actions.ungroupSelected();
  const restored = editor.actions.getScriptData();
  assert.deepEqual(
    restored.nodes.map((n) => ({ id: n.id, position: n.position })),
    original.nodes.map((n) => ({ id: n.id, position: n.position })),
  );
  assert.deepEqual(restored.edges, original.edges);
});

test("ungrouping retains internal edges once and preserves every exposed execution branch", () => {
  const internal = edge("internal", "first", "out", "second", "in");
  const graph = ungroup(
    [
      node("trigger", "trigger.on_join"),
      node("group", "layout.group"),
      node("input", "layout.group_input", "group"),
      node("output", "layout.group_output", "group"),
      node("first", "action.print", "group"),
      node("second", "action.print", "group"),
      node("after", "action.print"),
    ],
    [
      edge("incoming", "trigger", "out", "group", "in"),
      edge("first-in", "input", "in", "first", "in"),
      edge("second-in", "input", "in", "second", "in"),
      internal,
      edge("first-out", "first", "out", "output", "out"),
      edge("second-out", "second", "out", "output", "out"),
      edge("outgoing", "group", "out", "after", "in"),
    ],
  );
  assert.equal(graph.nodes.length, 4);
  assert.deepEqual(
    graph.edges.filter((e) => e.id === internal.id),
    [internal],
  );
  assert.deepEqual(
    graph.edges.map((e) => [e.source, e.target]).sort(),
    [
      ["trigger", "first"],
      ["trigger", "second"],
      ["first", "second"],
      ["first", "after"],
      ["second", "after"],
    ].sort(),
  );
});

for (const type of ["execution", "data"]) {
  test(`ungrouping connects ${type} pass-through wires to surviving endpoints`, () => {
    const incoming = edge("incoming", "source", "value", "group", "in");
    incoming.type = type;
    const outgoing = edge("outgoing", "group", "out", "target", "value", 3);
    outgoing.type = type;
    const graph = ungroup(
      [
        node("source", "constant.number"),
        node("group", "layout.group"),
        node("input", "layout.group_input", "group"),
        node("output", "layout.group_output", "group"),
        node("target", "action.print"),
      ],
      [incoming, edge("pass", "input", "in", "output", "out"), outgoing],
    );
    assert.equal(graph.edges.length, 1);
    assert.deepEqual(
      graph.edges.map((e) => [
        e.source,
        e.sourceHandle,
        e.target,
        e.targetHandle,
        e.type,
        e.data?.order,
      ]),
      [["source", "value", "target", "value", type, 3]],
    );
  });
}

test("ungrouping retains the internal consumer's multi-input order", () => {
  const graph = ungroup(
    [
      node("first", "constant.number"),
      node("second", "constant.number"),
      node("group", "layout.group"),
      node("input", "layout.group_input", "group"),
      node("list", "list.create", "group"),
    ],
    [
      edge("first-in", "first", "value", "group", "first", 0),
      edge("second-in", "second", "value", "group", "second", 1),
      edge("first-item", "input", "first", "list", "items", 1),
      edge("second-item", "input", "second", "list", "items", 0),
    ],
  );
  assert.deepEqual(
    graph.edges
      .slice()
      .sort((a, b) => Number(a.data?.order) - Number(b.data?.order))
      .map((e) => e.source),
    ["second", "first"],
  );
});

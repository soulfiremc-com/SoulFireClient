import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { createScriptEditorSession } from "./script-editor-store";

function connect(
  editor: ReturnType<typeof createScriptEditorSession>,
  source: string,
  target: string,
) {
  editor.actions.onConnect({
    source,
    sourceHandle: "out",
    target,
    targetHandle: "in",
  });
}

// A group whose inner wire overlaps a root wire in canvas coordinates.
function overlappingCanvases() {
  const editor = createScriptEditorSession();
  const group = editor.actions.addNode("layout.group", { x: 0, y: 0 });
  editor.actions.enterGroup(group);
  const inner = [
    editor.actions.addNode("action.print", { x: 0, y: 0 }),
    editor.actions.addNode("action.print", { x: 200, y: 0 }),
  ] as const;
  connect(editor, inner[0], inner[1]);
  editor.actions.exitToRoot();
  const outer = [
    editor.actions.addNode("action.print", { x: 1000, y: 0 }),
    editor.actions.addNode("action.print", { x: 1200, y: 0 }),
  ] as const;
  connect(editor, outer[0], outer[1]);
  const innerEdge = editor.document
    .get()
    .edges.find((edge) => edge.source === inner[0]);
  assert.ok(innerEdge);
  return { editor, group, innerEdge };
}

test("link cutting and wire drops only reach wires on the open canvas", () => {
  const { editor, group, innerEdge } = overlappingCanvases();
  const cut = () => {
    editor.actions.startLinkCutting({ x: 100, y: -100 });
    editor.actions.updateLinkCutting({ x: 100, y: 200 });
    editor.actions.endLinkCutting();
  };

  assert.equal(editor.actions.findClosestEdge({ x: 140, y: 40 }, 30), null);
  cut();
  assert.equal(editor.document.get().edges.length, 2);

  editor.actions.enterGroup(group);
  assert.equal(
    editor.actions.findClosestEdge({ x: 140, y: 40 }, 30)?.id,
    innerEdge.id,
  );
  cut();
  assert.deepEqual(
    editor.document
      .get()
      .edges.map((edge) => edge.id)
      .includes(innerEdge.id),
    false,
  );
  assert.equal(editor.document.get().edges.length, 1);
});

test("group input and output nodes survive select-all deletes and duplicates", () => {
  const editor = createScriptEditorSession();
  const first = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const second = editor.actions.addNode("action.print", { x: 300, y: 0 });
  const outside = editor.actions.addNode("action.print", { x: 600, y: 0 });
  connect(editor, first, second);
  connect(editor, second, outside);
  editor.actions.onNodesChange(
    [first, second].map((id) => ({ id, type: "select", selected: true })),
  );
  editor.actions.createGroupFromSelection();
  const group = editor.document
    .get()
    .nodes.find((node) => node.type === "layout.group");
  assert.ok(group);
  const interfaceCount = () =>
    editor.document
      .get()
      .nodes.filter((node) => node.type?.startsWith("layout.group_")).length;

  editor.actions.enterGroup(group.id);
  editor.actions.selectAll();
  editor.actions.duplicateSelected();
  assert.equal(interfaceCount(), 2);
  editor.actions.selectAll();
  assert.equal(editor.actions.getSelectedForClipboard()?.nodes.length, 4);
  editor.actions.deleteSelected();
  assert.equal(interfaceCount(), 2);
  editor.actions.selectAll();
  editor.actions.createGroupFromSelection();
  assert.equal(interfaceCount(), 2);
});

test("ungrouping drops every interface node and its wires", () => {
  const nodes: Node[] = [
    { id: "group", type: "layout.group", position: { x: 0, y: 0 }, data: {} },
    ...["in-a", "in-b"].map((id): Node => ({
      id,
      type: "layout.group_input",
      position: { x: 0, y: 0 },
      data: { parentGroupId: "group" },
    })),
    {
      id: "inner",
      type: "action.print",
      position: { x: 0, y: 0 },
      data: { parentGroupId: "group" },
    },
  ];
  const edges: Edge[] = [
    { id: "a", source: "in-a", sourceHandle: "x", target: "inner" },
    { id: "b", source: "in-b", sourceHandle: "x", target: "inner" },
  ];
  const editor = createScriptEditorSession();
  editor.actions.loadScriptData({ nodes, edges, quotas: undefined });
  editor.actions.setSelectedNode("group");
  editor.actions.ungroupSelected();
  const graph = editor.document.get();
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["inner"],
  );
  assert.deepEqual(graph.edges, []);
});

test("undoing back to the saved graph clears the unsaved state", () => {
  const editor = createScriptEditorSession();
  editor.actions.loadScript({
    id: "script",
    name: "Saved",
    description: "",
    paused: true,
    quotas: undefined,
    nodes: [
      {
        id: "saved",
        type: "action.print",
        position: { x: 0, y: 0 },
        data: {},
      },
    ],
    edges: [],
  });
  editor.actions.addNode("action.print", { x: 100, y: 0 });
  assert.equal(editor.document.get().isDirty, true);
  editor.actions.undo();
  assert.equal(editor.document.get().isDirty, false);
  editor.actions.redo();
  assert.equal(editor.document.get().isDirty, true);

  // A rename is not part of the graph history, so it stays unsaved.
  editor.actions.undo();
  editor.actions.setScriptName("Renamed");
  editor.actions.addNode("action.print", { x: 100, y: 0 });
  editor.actions.undo();
  assert.equal(editor.document.get().isDirty, true);
});

test("undoing a new script back to empty leaves nothing to save", () => {
  const editor = createScriptEditorSession();
  editor.actions.addNode("action.print", { x: 0, y: 0 });
  editor.actions.undo();
  assert.equal(editor.document.get().isDirty, false);
});

test("node outputs fill the node preview and connected debug nodes", () => {
  const editor = createScriptEditorSession();
  const source = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const debug = editor.actions.addNode("layout.debug", { x: 200, y: 0 });
  const unrelated = editor.actions.addNode("layout.debug", { x: 200, y: 200 });
  editor.actions.onConnect({
    source,
    sourceHandle: "value",
    target: debug,
    targetHandle: "in",
  });
  editor.actions.recordNodeOutputs(source, { value: 5, other: 1 });
  editor.actions.recordNodeOutputs(source, { value: 6 });
  const { previewValues, debugNodeValues } = editor.execution.get();
  assert.deepEqual(previewValues.get(source), { value: 6 });
  assert.deepEqual(
    debugNodeValues.get(debug)?.map((entry) => entry.value),
    [5, 6],
  );
  assert.equal(debugNodeValues.has(unrelated), false);
});

test("dragging inside a group keeps the visible edge list", () => {
  const { editor, group, innerEdge } = overlappingCanvases();
  editor.actions.enterGroup(group);
  const edges = editor.visibleEdges.get();
  assert.deepEqual(
    edges.map((edge) => edge.id),
    [innerEdge.id],
  );
  editor.actions.onNodesChange([
    {
      type: "position",
      id: innerEdge.source,
      position: { x: 40, y: 40 },
      dragging: true,
    },
  ]);
  assert.equal(editor.visibleEdges.get(), edges);
});

test("deleting with nothing to delete leaves a saved script saved", () => {
  const editor = createScriptEditorSession();
  const group = "group";
  editor.actions.loadScript({
    id: "script",
    name: "Script",
    description: "",
    paused: true,
    quotas: undefined,
    nodes: [
      { id: group, type: "layout.group", position: { x: 0, y: 0 }, data: {} },
      {
        id: "input",
        type: "layout.group_input",
        position: { x: 0, y: 0 },
        data: { parentGroupId: group },
        selected: true,
      },
    ],
    edges: [],
  });
  editor.actions.deleteSelected();
  assert.equal(editor.document.get().isDirty, false);
  // Group interface nodes stay with their group.
  editor.actions.enterGroup(group);
  editor.actions.deleteSelected();
  assert.equal(editor.document.get().nodes.length, 2);
  assert.equal(editor.document.get().isDirty, false);
  assert.equal(editor.history.get().past.length, 0);
});

test("only previewed or debugged nodes have observed outputs", () => {
  const editor = createScriptEditorSession();
  const source = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const other = editor.actions.addNode("action.print", { x: 0, y: 100 });
  const reroute = editor.actions.addNode("layout.reroute", { x: 100, y: 0 });
  const debug = editor.actions.addNode("layout.debug", { x: 200, y: 0 });
  editor.actions.onConnect({
    source,
    sourceHandle: "value",
    target: reroute,
    targetHandle: "in",
  });
  editor.actions.onConnect({
    source: reroute,
    sourceHandle: "out",
    target: debug,
    targetHandle: "in",
  });
  assert.equal(editor.actions.observesNodeOutputs(source), true);
  assert.equal(editor.actions.observesNodeOutputs(other), false);
  editor.actions.togglePreview(other);
  assert.equal(editor.actions.observesNodeOutputs(other), true);
  editor.actions.recordNodeOutputs(source, { value: 7 });
  assert.deepEqual(
    editor.execution
      .get()
      .debugNodeValues.get(debug)
      ?.map((entry) => entry.value),
    [7],
  );
});

test("pasting skips group interface nodes copied on their own", () => {
  const editor = createScriptEditorSession();
  editor.actions.pasteClipboardData(
    {
      nodes: [
        {
          id: "input",
          type: "layout.group_input",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "print",
          type: "action.print",
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [{ id: "wire", source: "input", target: "print" }],
    },
    { x: 0, y: 0 },
  );
  const { nodes, edges } = editor.document.get();
  assert.deepEqual(
    nodes.map((node) => node.type),
    ["action.print"],
  );
  assert.equal(edges.length, 0);
});

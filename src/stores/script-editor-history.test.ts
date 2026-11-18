import assert from "node:assert/strict";
import { test } from "node:test";
import { createScriptEditorSession } from "./script-editor-store";

function positionOf(
  editor: ReturnType<typeof createScriptEditorSession>,
  id: string,
) {
  return editor.document.get().nodes.find((node) => node.id === id)?.position;
}

test("undo and redo step through graph edits, and a new edit drops redo", () => {
  const editor = createScriptEditorSession();
  const first = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const second = editor.actions.addNode("action.print", { x: 300, y: 0 });
  editor.actions.onConnect({
    source: first,
    sourceHandle: "out",
    target: second,
    targetHandle: "in",
  });
  assert.equal(editor.document.get().edges.length, 1);

  editor.actions.undo();
  assert.equal(editor.document.get().edges.length, 0);
  assert.equal(editor.document.get().nodes.length, 2);
  editor.actions.undo();
  assert.deepEqual(
    editor.document.get().nodes.map((node) => node.id),
    [first],
  );

  editor.actions.redo();
  assert.equal(editor.document.get().nodes.length, 2);
  assert.equal(editor.history.get().future.length, 1);

  // Edits that change nothing keep the redo steps.
  editor.actions.deleteSelected();
  assert.equal(editor.history.get().future.length, 1);
  editor.actions.toggleMute(first);
  assert.equal(editor.history.get().future.length, 0);
  editor.actions.redo();
  assert.equal(editor.document.get().edges.length, 0);
});

test("a drag records one undo step and selection records none", () => {
  const editor = createScriptEditorSession();
  const id = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const before = editor.history.get().past.length;

  editor.actions.onNodesChange([{ id, type: "select", selected: true }]);
  for (const x of [10, 20, 30]) {
    editor.actions.onNodesChange([
      { id, type: "position", position: { x, y: 0 }, dragging: true },
    ]);
  }
  editor.actions.onNodesChange([
    { id, type: "position", position: { x: 30, y: 0 }, dragging: false },
  ]);
  assert.equal(editor.history.get().past.length, before + 1);

  editor.actions.undo();
  assert.deepEqual(positionOf(editor, id), { x: 0, y: 0 });
  editor.actions.redo();
  assert.deepEqual(positionOf(editor, id), { x: 30, y: 0 });
});

test("typing into one field merges, while another field starts a new step", () => {
  const editor = createScriptEditorSession();
  const id = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const before = editor.history.get().past.length;
  for (const message of ["h", "he", "hey"]) {
    editor.actions.updateNodeData(id, { message });
  }
  assert.equal(editor.history.get().past.length, before + 1);
  editor.actions.updateNodeData(id, { label: "Greeting" });
  assert.equal(editor.history.get().past.length, before + 2);

  editor.actions.undo();
  editor.actions.undo();
  const data = editor.document.get().nodes[0]?.data;
  assert.ok(data);
  assert.equal(data["message"], undefined);
  assert.equal(data["label"], undefined);
});

test("a rewiring gesture that ends where it started records nothing", () => {
  const editor = createScriptEditorSession();
  const first = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const second = editor.actions.addNode("action.print", { x: 300, y: 0 });
  editor.actions.onConnect({
    source: first,
    sourceHandle: "out",
    target: second,
    targetHandle: "in",
  });
  const before = editor.history.get().past.length;
  const edge = editor.document.get().edges[0];
  assert.ok(edge);

  editor.actions.beginHistoryGesture();
  editor.actions.onEdgesChange([{ id: edge.id, type: "remove" }]);
  editor.document.setState((state) => ({
    ...state,
    edges: [edge],
  }));
  editor.actions.endHistoryGesture();
  assert.equal(editor.history.get().past.length, before);

  editor.actions.beginHistoryGesture();
  editor.actions.onEdgesChange([{ id: edge.id, type: "remove" }]);
  editor.actions.endHistoryGesture();
  assert.equal(editor.history.get().past.length, before + 1);
  editor.actions.undo();
  assert.deepEqual(
    editor.document.get().edges.map((item) => item.id),
    [edge.id],
  );
});

test("undoing a group while inside it returns to the remaining graph", () => {
  const editor = createScriptEditorSession();
  const id = editor.actions.addNode("action.print", { x: 0, y: 0 });
  editor.actions.onNodesChange([{ id, type: "select", selected: true }]);
  editor.actions.createGroupFromSelection();
  const group = editor.document
    .get()
    .nodes.find((node) => node.type === "layout.group");
  assert.ok(group);
  editor.actions.enterGroup(group.id);

  editor.actions.undo();
  assert.deepEqual(editor.ui.get().groupEditStack, []);
  const [remaining] = editor.document.get().nodes;
  assert.ok(remaining);
  assert.equal(editor.document.get().nodes.length, 1);
  assert.equal(remaining.data["parentGroupId"], undefined);
});

test("loading or resetting a script forgets the previous history", () => {
  const editor = createScriptEditorSession();
  editor.actions.addNode("action.print", { x: 0, y: 0 });
  editor.actions.loadScript({
    id: "script",
    name: "Script",
    description: "",
    paused: true,
    quotas: undefined,
    nodes: [],
    edges: [],
  });
  assert.deepEqual(editor.history.get(), { past: [], future: [] });
  editor.actions.undo();
  assert.equal(editor.document.get().isDirty, false);

  editor.actions.addNode("action.print", { x: 0, y: 0 });
  editor.actions.resetEditor();
  assert.deepEqual(editor.history.get(), { past: [], future: [] });
});

test("revealing a node opens its nested groups and selects only that node", () => {
  const editor = createScriptEditorSession();
  const outside = editor.actions.addNode("action.print", { x: 0, y: 0 });
  const inner = editor.actions.addNode("action.print", { x: 300, y: 0 });
  editor.actions.onNodesChange([{ id: inner, type: "select", selected: true }]);
  editor.actions.createGroupFromSelection();
  const outer = editor.document
    .get()
    .nodes.find((node) => node.type === "layout.group");
  assert.ok(outer);
  editor.actions.onNodesChange([
    { id: outer.id, type: "select", selected: true },
  ]);
  editor.actions.createGroupFromSelection();
  const top = editor.document
    .get()
    .nodes.find((node) => node.type === "layout.group" && node.id !== outer.id);
  assert.ok(top);
  editor.actions.onNodesChange([
    { id: outside, type: "select", selected: true },
  ]);

  assert.equal(editor.actions.revealNode(inner), true);
  assert.deepEqual(editor.ui.get().groupEditStack, [top.id, outer.id]);
  assert.equal(editor.ui.get().selectedNodeId, inner);
  assert.deepEqual(
    editor.document
      .get()
      .nodes.filter((node) => node.selected)
      .map((node) => node.id),
    [inner],
  );
  assert.equal(editor.actions.revealNode("missing"), false);
});

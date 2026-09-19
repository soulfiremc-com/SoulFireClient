import assert from "node:assert/strict";
import { test } from "node:test";
import { createScriptEditorSession } from "./script-editor-store";

test("editor sessions isolate document, UI, and execution updates", () => {
  const first = createScriptEditorSession();
  const second = createScriptEditorSession();
  const id = first.actions.addNode("value", { x: 0, y: 0 }, { value: 1 });
  const document = first.document.get();
  let documentUpdates = 0;
  const sub = first.document.subscribe(() => documentUpdates++);
  first.actions.setSelectedNode(id);
  first.actions.setActiveNode(id);
  first.actions.updatePreviewValue(id, { value: 2 });
  assert.equal(documentUpdates, 0);
  assert.equal(first.document.get(), document);
  assert.equal(second.document.get().nodes.length, 0);
  assert.equal(second.ui.get().selectedNodeId, null);
  assert.equal(second.execution.get().previewValues.size, 0);
  sub.unsubscribe();
});

test("validation ignores canvas changes but observes graph edits", () => {
  const session = createScriptEditorSession();
  const id = session.actions.addNode("value", { x: 0, y: 0 }, { value: 1 });
  const initial = session.validationGraph.get();
  let updates = 0;
  const sub = session.validationGraph.subscribe(() => updates++);
  session.actions.onNodesChange([{ type: "select", id, selected: true }]);
  session.actions.onNodesChange([
    { type: "dimensions", id, dimensions: { width: 100, height: 100 } },
  ]);
  session.actions.onNodesChange([
    { type: "position", id, position: { x: 50, y: 50 }, dragging: true },
  ]);
  session.actions.toggleCollapse(id);
  assert.equal(session.validationGraph.get(), initial);
  assert.equal(updates, 0);
  session.actions.updateNodeData(id, { value: 2 });
  assert.equal(updates, 1);
  assert.equal(session.validationGraph.get().nodes[0].data.value, 2);
  const other = session.actions.addNode("value", { x: 0, y: 0 });
  session.actions.onConnect({
    source: id,
    target: other,
    sourceHandle: null,
    targetHandle: null,
  });
  assert.equal(session.validationGraph.get().edges.length, 1);
  const connected = session.validationGraph.get();
  session.actions.onEdgesChange([
    { type: "select", id: connected.edges[0].id, selected: true },
  ]);
  assert.equal(session.validationGraph.get(), connected);
  sub.unsubscribe();
});

test("group views cache their results and update with graph membership", () => {
  const session = createScriptEditorSession();
  const group = session.actions.addNode("layout.group", { x: 0, y: 0 });
  session.actions.enterGroup(group);
  const child = session.actions.addNode("value", { x: 0, y: 0 });
  const visible = session.visibleNodes.get();
  assert.deepEqual(
    visible.map((node) => node.id),
    [child],
  );
  session.actions.openQuickAddMenu({ x: 5, y: 5 }, { x: 5, y: 5 });
  session.actions.updateDebugValue(child, 42);
  assert.equal(session.visibleNodes.get(), visible);
  session.actions.exitToRoot();
  assert.equal(session.visibleNodes.get(), session.document.get().nodes);
});

test("diagnostics retain unaffected node results and reset with the editor", () => {
  const session = createScriptEditorSession();
  const first = session.actions.addNode("value", { x: 0, y: 0 });
  const second = session.actions.addNode("value", { x: 0, y: 0 });
  const diagnostic = {
    nodeId: first,
    edgeId: "",
    message: "",
    severity: "error" as const,
  };
  session.actions.setValidationDiagnostics([diagnostic]);
  const before = session.validation.get().diagnosticsByNode.get(first);
  session.actions.setValidationDiagnostics([
    { ...diagnostic },
    { ...diagnostic, nodeId: second },
  ]);
  assert.equal(session.validation.get().diagnosticsByNode.get(first), before);
  assert.equal(session.validation.get().diagnosticsByNode.size, 2);
  session.actions.resetEditor();
  assert.equal(session.validation.get().diagnosticsByNode.size, 0);
});

test("React Flow changes preserve untouched node identities and saved graphs", () => {
  const session = createScriptEditorSession();
  const first = session.actions.addNode("value", { x: 0, y: 0 });
  session.actions.addNode("value", { x: 1, y: 1 });
  session.actions.markSaved();
  const before = session.document.get();
  session.actions.onNodesChange([
    { type: "position", id: first, position: { x: 2, y: 2 } },
  ]);
  const after = session.document.get();
  assert.equal(after.nodes[1], before.nodes[1]);
  assert.notEqual(after.nodes[0], before.nodes[0]);
  assert.deepEqual(after.lastSavedNodes?.[0].position, { x: 0, y: 0 });
  assert.equal(after.isDirty, true);
});

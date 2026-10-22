import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  ScriptQuotasSchema,
  ScriptStatusSchema,
} from "@/generated/soulfire/script_pb";
import { createScriptEditorSession } from "./script-editor-store";

test("polled nodes restore observation without replacing fresher streaming highlights", () => {
  const editor = createScriptEditorSession();
  editor.actions.markSaved(editor.actions.getScriptData(), "script");
  const document = editor.document.get();
  const status = create(ScriptStatusSchema, {
    scriptId: "script",
    isActive: true,
    activeNodeId: "waiting",
    paused: false,
  });
  editor.actions.syncScriptStatus(status);
  assert.equal(editor.execution.get().activeNodeId, "waiting");
  editor.actions.setActiveNode("newer");
  editor.actions.syncScriptStatus(status, true);
  assert.equal(editor.execution.get().activeNodeId, "newer");
  editor.actions.syncScriptStatus({ ...status, activeNodeId: undefined });
  assert.equal(editor.execution.get().activeNodeId, null);
  editor.actions.setActiveNode("streaming");
  editor.actions.syncScriptStatus({ ...status, isActive: false }, true);
  assert.equal(editor.execution.get().activeNodeId, null);
  assert.equal(editor.document.get(), document);
});

test("canonical documents retain selection and newer drafts until remote content changes", () => {
  const editor = createScriptEditorSession();
  const id = editor.actions.addNode(
    "constant.number",
    { x: 10, y: 20 },
    { value: 1 },
  );
  const saved = { ...editor.actions.getScriptData(), id: "script" };
  editor.actions.markSaved(saved, saved.id);
  editor.actions.onNodesChange([{ type: "select", id, selected: true }]);
  editor.actions.setSelectedNode(id);
  const selected = editor.document.get();

  editor.actions.syncScriptDocument(structuredClone(saved));
  assert.equal(editor.document.get(), selected);
  assert.equal(editor.ui.get().selectedNodeId, id);
  assert.equal(editor.document.get().nodes[0].selected, true);

  editor.actions.updateNodeData(id, { value: 3 });
  const draft = editor.document.get();
  const remote = {
    ...saved,
    nodes: saved.nodes.map((node) => ({ ...node, data: { value: 2 } })),
  };
  editor.actions.syncScriptDocument(remote);
  assert.equal(editor.document.get(), draft);
  assert.equal(editor.document.get().nodes[0].data.value, 3);

  editor.actions.markSaved(editor.actions.getScriptData());
  editor.actions.syncScriptDocument(remote);
  assert.equal(editor.document.get().nodes[0].data.value, 2);
  assert.equal(editor.ui.get().selectedNodeId, null);
  assert.equal(editor.document.get().isDirty, false);
});

test("node completion clears its own highlight without clearing a newer execution", () => {
  const editor = createScriptEditorSession();
  const document = editor.document.get();
  editor.actions.setActiveNode("first");
  editor.actions.setActiveNode("second");
  const running = editor.execution.get();
  editor.actions.completeNode("first");
  assert.equal(editor.execution.get(), running);
  assert.equal(editor.execution.get().activeNodeId, "second");
  editor.actions.completeNode("second");
  assert.equal(editor.execution.get().activeNodeId, null);
  assert.equal(editor.document.get(), document);
});

test("status updates pause controls without replacing unsaved graph edits", () => {
  const editor = createScriptEditorSession();
  editor.actions.markSaved(editor.actions.getScriptData(), "script");
  const node = editor.actions.addNode(
    "constant.number",
    { x: 10, y: 20 },
    { value: 2 },
  );
  editor.actions.setActiveNode(node);
  const before = editor.document.get();
  editor.actions.syncScriptStatus(
    create(ScriptStatusSchema, {
      scriptId: "script",
      paused: true,
      isActive: false,
    }),
  );
  const paused = editor.document.get();
  assert.equal(paused.paused, true);
  assert.equal(paused.lastSavedPaused, true);
  assert.equal(paused.nodes, before.nodes);
  assert.equal(paused.lastSavedNodes, before.lastSavedNodes);
  assert.equal(paused.isDirty, true);
  assert.equal(editor.execution.get().activeNodeId, null);
  editor.actions.syncScriptStatus(
    create(ScriptStatusSchema, {
      scriptId: "script",
      paused: false,
      isActive: true,
    }),
  );
  assert.equal(editor.document.get().paused, false);
  assert.equal(editor.execution.get().isActive, true);
});

test("status preserves local pause intent and ignores other scripts and unknown pause settings", () => {
  const editor = createScriptEditorSession();
  editor.actions.markSaved(editor.actions.getScriptData(), "script");
  editor.actions.setPaused(true);
  editor.actions.syncScriptStatus(
    create(ScriptStatusSchema, {
      scriptId: "script",
      paused: false,
      isActive: true,
    }),
  );
  const local = editor.document.get();
  assert.equal(local.paused, true);
  assert.equal(local.lastSavedPaused, false);
  editor.actions.syncScriptStatus(
    create(ScriptStatusSchema, {
      scriptId: "script",
      isActive: false,
    }),
  );
  assert.equal(editor.document.get(), local);
  editor.actions.syncScriptStatus(
    create(ScriptStatusSchema, {
      scriptId: "other",
      paused: true,
      isActive: true,
    }),
  );
  assert.equal(editor.document.get(), local);
  assert.equal(editor.execution.get().isActive, false);
});

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
  assert.deepEqual(
    session.visibleNodes.get().map((node) => node.id),
    [group],
  );
});

function nestedGraph() {
  const session = createScriptEditorSession();
  const group = session.actions.addNode("layout.group", { x: 100, y: 200 });
  const outside = session.actions.addNode("value", { x: 300, y: 400 });
  session.actions.enterGroup(group);
  const frame = session.actions.addNode("layout.frame", { x: -20, y: -30 });
  const child = session.actions.addNode(
    "value",
    { x: 10, y: 20 },
    {
      parentFrameId: frame,
    },
  );
  session.actions.updateNodeData(frame, { containedNodes: [child] });
  const nested = session.actions.addNode("layout.group", { x: 70, y: 80 });
  session.actions.onConnect({
    source: child,
    target: nested,
    sourceHandle: null,
    targetHandle: null,
  });
  session.actions.enterGroup(nested);
  const first = session.actions.addNode("value", { x: -100, y: 40 });
  const second = session.actions.addNode("value", { x: 60, y: -50 });
  session.actions.onConnect({
    source: first,
    target: second,
    sourceHandle: null,
    targetHandle: null,
  });
  session.actions.exitToRoot();
  session.actions.onConnect({
    source: group,
    target: outside,
    sourceHandle: null,
    targetHandle: null,
  });
  session.actions.onNodesChange([
    { type: "select", id: group, selected: true },
  ]);
  return { session, group, outside, nested, first };
}

test("each group view shows only its direct nodes and connections", () => {
  const { session, group, outside, nested, first } = nestedGraph();
  assert.deepEqual(
    session.visibleNodes.get().map((node) => node.id),
    [group, outside],
  );
  assert.equal(session.visibleEdges.get().length, 1);
  assert.equal(session.visibleEdges.get()[0].source, group);
  session.actions.enterGroup(group);
  assert.equal(session.visibleNodes.get().length, 3);
  assert.equal(session.visibleEdges.get().length, 1);
  assert.equal(session.visibleEdges.get()[0].target, nested);
  session.actions.enterGroup(nested);
  assert.equal(session.visibleNodes.get().length, 2);
  assert.equal(session.visibleEdges.get()[0].source, first);
});

test("duplicating a group clones its nested graph and internal frame references", () => {
  const { session, outside } = nestedGraph();
  session.actions.markSaved(session.actions.getScriptData());
  const before = session.document.get();
  const originals = before.nodes.filter((node) => node.id !== outside);
  session.actions.duplicateSelected();
  const after = session.document.get();
  const copies = after.nodes.slice(before.nodes.length);
  assert.equal(copies.length, originals.length);
  const ids = new Map(
    originals.map((node, index) => [node.id, copies[index].id]),
  );
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    assert.equal(
      before.nodes.some((node) => node.id === copy.id),
      false,
    );
    assert.equal(
      copy.data.parentGroupId,
      ids.get(original.data.parentGroupId as string),
    );
    assert.equal(
      copy.data.parentFrameId,
      ids.get(original.data.parentFrameId as string),
    );
    if (Array.isArray(original.data.containedNodes)) {
      assert.deepEqual(
        copy.data.containedNodes,
        original.data.containedNodes.map((id: string) => ids.get(id)),
      );
    }
    assert.deepEqual(
      copy.position,
      original.data.parentGroupId
        ? original.position
        : { x: original.position.x + 50, y: original.position.y + 50 },
    );
    assert.equal(copy.selected, !original.data.parentGroupId);
  }
  const copiedEdges = after.edges.slice(before.edges.length);
  assert.equal(copiedEdges.length, 2);
  for (const edge of copiedEdges) {
    assert.equal([...ids.values()].includes(edge.source), true);
    assert.equal([...ids.values()].includes(edge.target), true);
    assert.equal(
      before.edges.some((original) => original.id === edge.id),
      false,
    );
  }
  assert.equal(after.lastSavedNodes, before.lastSavedNodes);
  assert.equal(before.nodes[0].selected, true);
  assert.equal(
    after.nodes.slice(0, before.nodes.length).some((node) => node.selected),
    false,
  );
});

test("pasting groups into another group retains hierarchy and offsets only root nodes", () => {
  const { session: source, outside } = nestedGraph();
  source.actions.onNodesChange([
    { type: "select", id: outside, selected: true },
  ]);
  const clipboard = source.actions.getSelectedForClipboard();
  assert.ok(clipboard);
  assert.equal(clipboard.nodes.length, source.document.get().nodes.length);
  assert.equal(clipboard.edges.length, 3);
  const target = createScriptEditorSession();
  const parent = target.actions.addNode("layout.group", { x: 0, y: 0 });
  target.actions.enterGroup(parent);
  target.actions.pasteClipboardData(clipboard, { x: 500, y: 600 });
  const copies = target.document.get().nodes.slice(1);
  assert.equal(copies.length, clipboard.nodes.length);
  const ids = new Map(
    clipboard.nodes.map((node, index) => [node.id, copies[index].id]),
  );
  for (const [index, original] of clipboard.nodes.entries()) {
    const copy = copies[index];
    assert.equal(
      copy.data.parentGroupId,
      ids.get(original.data.parentGroupId as string) ?? parent,
    );
    assert.equal(
      copy.data.parentFrameId,
      ids.get(original.data.parentFrameId as string),
    );
    assert.deepEqual(
      copy.position,
      original.data.parentGroupId
        ? original.position
        : { x: original.position.x + 300, y: original.position.y + 300 },
    );
    assert.equal(copy.selected, !original.data.parentGroupId);
  }
  assert.equal(target.visibleNodes.get().length, 2);
  assert.equal(target.visibleEdges.get().length, 1);
  for (const edge of target.document.get().edges) {
    assert.equal([...ids.values()].includes(edge.source), true);
    assert.equal([...ids.values()].includes(edge.target), true);
  }
});

test("deleting a group removes descendants and their edges without leaving orphans", () => {
  const { session, outside } = nestedGraph();
  session.actions.deleteSelected();
  assert.deepEqual(
    session.document.get().nodes.map((node) => node.id),
    [outside],
  );
  assert.deepEqual(session.document.get().edges, []);
});

test("copying from inside a group rebases roots without retaining the source parent", () => {
  const { session, group } = nestedGraph();
  const container = session.actions.addNode("layout.group", { x: 0, y: 0 });
  session.actions.updateNodeData(group, { parentGroupId: container });
  session.actions.enterGroup(container);
  const clipboard = session.actions.getSelectedForClipboard();
  assert.ok(clipboard);
  const target = createScriptEditorSession();
  target.actions.pasteClipboardData(clipboard, { x: 0, y: 0 });
  assert.equal(target.visibleNodes.get().length, 1);
  const root = target.visibleNodes.get()[0];
  assert.equal(root.data.parentGroupId, undefined);
  assert.deepEqual(root.position, { x: 0, y: 0 });
  assert.equal(
    target.document
      .get()
      .nodes.some((node) => node.data.parentGroupId === container),
    false,
  );
});

test("deleting a visible selection preserves selected edges in hidden groups", () => {
  const { session, group } = nestedGraph();
  session.actions.onNodesChange([
    { type: "select", id: group, selected: false },
  ]);
  const hiddenEdge = session.document.get().edges[0];
  session.actions.onEdgesChange([
    { type: "select", id: hiddenEdge.id, selected: true },
  ]);
  const visibleEdge = session.visibleEdges.get()[0];
  session.actions.onEdgesChange([
    { type: "select", id: visibleEdge.id, selected: true },
  ]);
  session.actions.deleteSelected();
  assert.equal(session.document.get().nodes.length, 7);
  assert.equal(
    session.document.get().edges.some((edge) => edge.id === hiddenEdge.id),
    true,
  );
  assert.equal(session.visibleEdges.get().length, 0);
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
  session.actions.markSaved(session.actions.getScriptData());
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

test("save acknowledgement retains newer graph edits and their submitted baseline", () => {
  const session = createScriptEditorSession();
  session.actions.setScriptName("Submitted");
  const first = session.actions.addNode("value", { x: 0, y: 0 }, { value: 1 });
  const second = session.actions.addNode("value", { x: 100, y: 0 });
  session.actions.onConnect({
    source: first,
    target: second,
    sourceHandle: null,
    targetHandle: null,
  });
  const submitted = session.actions.getScriptData();
  session.actions.setScriptName("Newer edit");
  session.actions.updateNodeData(first, { value: 2 });
  const third = session.actions.addNode("value", { x: 200, y: 0 });
  session.actions.onConnect({
    source: second,
    target: third,
    sourceHandle: null,
    targetHandle: null,
  });
  session.actions.markSaved(submitted, "created-id");
  const acknowledged = session.document.get();
  assert.equal(acknowledged.scriptId, "created-id");
  assert.equal(acknowledged.scriptName, "Newer edit");
  assert.equal(acknowledged.nodes[0].data.value, 2);
  assert.equal(acknowledged.nodes.length, 3);
  assert.equal(acknowledged.edges.length, 2);
  assert.equal(acknowledged.lastSavedNodes?.[0].data.value, 1);
  assert.equal(acknowledged.lastSavedNodes?.length, 2);
  assert.equal(acknowledged.lastSavedEdges?.length, 1);
  assert.equal(acknowledged.isDirty, true);
  session.actions.markSaved(session.actions.getScriptData());
  assert.equal(session.document.get().isDirty, false);
  assert.equal(session.document.get().lastSavedNodes?.length, 3);
});

test("canvas selection and measurement do not make an acknowledged save dirty", () => {
  const session = createScriptEditorSession();
  const first = session.actions.addNode("value", { x: 0, y: 0 });
  const second = session.actions.addNode("value", { x: 100, y: 0 });
  session.actions.onConnect({
    source: first,
    target: second,
    sourceHandle: null,
    targetHandle: null,
  });
  const submitted = session.actions.getScriptData();
  session.actions.onNodesChange([
    { type: "select", id: first, selected: true },
    { type: "dimensions", id: first, dimensions: { width: 160, height: 100 } },
  ]);
  session.actions.onEdgesChange([
    { type: "select", id: submitted.edges[0].id, selected: true },
  ]);
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, false);
  assert.equal(session.document.get().nodes[0].selected, true);
  assert.equal(session.document.get().nodes[0].measured?.height, 100);
});

test("explicit frame resizes change the saved document while measurements stay clean", () => {
  const session = createScriptEditorSession();
  const id = crypto.randomUUID();
  session.actions.loadScript({
    id: crypto.randomUUID(),
    name: "Frame",
    description: "",
    paused: true,
    quotas: undefined,
    nodes: [
      {
        id,
        type: "layout.frame",
        position: { x: 0, y: 0 },
        width: 300,
        height: 160,
        data: {},
      },
    ],
    edges: [],
  });
  session.actions.onNodesChange([
    { type: "dimensions", id, dimensions: { width: 300, height: 160 } },
  ]);
  assert.equal(session.document.get().isDirty, false);
  for (const [setAttributes, width, height] of [
    [true, 348, 192],
    ["width", 384, 192],
    ["height", 384, 224],
  ] as const) {
    session.actions.onNodesChange([
      {
        type: "dimensions",
        id,
        dimensions: { width, height },
        resizing: true,
        setAttributes,
      },
    ]);
    assert.equal(session.document.get().isDirty, true);
    if (setAttributes === true) {
      assert.equal(session.document.get().lastSavedNodes?.[0].width, 300);
      assert.equal(session.document.get().lastSavedNodes?.[0].height, 160);
    }
    session.actions.markSaved(session.actions.getScriptData());
    session.actions.onNodesChange([
      {
        type: "dimensions",
        id,
        dimensions: { width, height },
        resizing: false,
      },
    ]);
    assert.equal(session.document.get().isDirty, false);
  }
  assert.equal(session.document.get().nodes[0].width, 384);
  assert.equal(session.document.get().nodes[0].height, 224);
});

test("acknowledgement compares quota values without losing bigint precision", () => {
  const session = createScriptEditorSession();
  session.actions.setQuotas(
    create(ScriptQuotasSchema, { maxExecutionCount: 9_007_199_254_740_993n }),
  );
  const submitted = session.actions.getScriptData();
  session.actions.setQuotas(
    create(ScriptQuotasSchema, { maxExecutionCount: 9_007_199_254_740_993n }),
  );
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, false);
  session.actions.setQuotas(
    create(ScriptQuotasSchema, { maxExecutionCount: 9_007_199_254_740_994n }),
  );
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, true);
  session.actions.setQuotas(submitted.quotas);
  session.actions.setScriptDescription("New description");
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, true);
  session.actions.setScriptDescription(submitted.description);
  session.actions.setPaused(!submitted.paused);
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, true);
});

test("acknowledgement detects node values and edge rewiring without metadata changes", () => {
  const session = createScriptEditorSession();
  const first = session.actions.addNode("value", { x: 0, y: 0 }, { value: 1 });
  const second = session.actions.addNode("value", { x: 100, y: 0 });
  session.actions.onConnect({
    source: first,
    target: second,
    sourceHandle: null,
    targetHandle: null,
  });
  const submitted = session.actions.getScriptData();
  session.actions.updateNodeData(first, { value: 2 });
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, true);
  session.actions.updateNodeData(first, { value: 1 });
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, false);
  const edge = submitted.edges[0];
  session.actions.onEdgesChange([
    {
      type: "replace",
      id: edge.id,
      item: { ...edge, source: second, target: first },
    },
  ]);
  session.actions.markSaved(submitted);
  assert.equal(session.document.get().isDirty, true);
  assert.equal(session.document.get().lastSavedEdges?.[0].source, first);
  assert.equal(session.document.get().edges[0].source, second);
});

test("framing selected nodes creates explicit dimensions for saving and resizing", () => {
  const session = createScriptEditorSession();
  const id = session.actions.addNode("constant.string", { x: 10, y: 20 });
  session.actions.onNodesChange([
    { type: "dimensions", id, dimensions: { width: 160, height: 100 } },
  ]);
  session.actions.createFrame([id]);
  const frame = session.document
    .get()
    .nodes.find((node) => node.type === "layout.frame");
  assert.ok(frame);
  assert.deepEqual(frame.position, { x: -30, y: -20 });
  assert.equal(frame.width, 240);
  assert.equal(frame.height, 180);
  assert.equal(
    session.document.get().nodes.find((node) => node.id === id)?.data
      .parentFrameId,
    frame.id,
  );
});

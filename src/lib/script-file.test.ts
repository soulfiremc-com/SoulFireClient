import assert from "node:assert/strict";
import { test } from "node:test";
import { create, equals } from "@bufbuild/protobuf";
import { ScriptQuotasSchema } from "@/generated/soulfire/script_pb";
import { createScriptEditorSession } from "@/stores/script-editor-store";
import { parseScriptFile, serializeScriptFile } from "./script-file";

test("script files retain exact quotas and graph data through import and save", () => {
  const source = createScriptEditorSession();
  source.actions.setScriptName("Round trip");
  source.actions.setScriptDescription("Quota and graph fixture");
  source.actions.setPaused(true);
  const first = source.actions.addNode(
    "constant.number",
    { x: 12, y: 34 },
    { value: 42 },
  );
  const second = source.actions.addNode("constant.number", { x: 56, y: 78 });
  source.actions.onConnect({
    source: first,
    target: second,
    sourceHandle: null,
    targetHandle: null,
  });
  for (const quotas of [
    create(ScriptQuotasSchema, {
      maxExecutionCount: 9_007_199_254_740_993n,
      maxExecutionTimeMs: 9_223_372_036_854_775_807n,
      maxConcurrentTriggers: 3,
      maxStateStoreEntries: 42n,
    }),
    create(ScriptQuotasSchema, {
      maxExecutionCount: 0n,
      disableTimeouts: true,
    }),
    create(ScriptQuotasSchema),
  ]) {
    source.actions.setQuotas(quotas);
    const submitted = source.actions.getScriptData();
    const target = createScriptEditorSession();
    target.actions.loadScriptData(
      parseScriptFile(serializeScriptFile(submitted)),
    );
    const imported = target.actions.getScriptData();
    assert.deepEqual(imported, submitted);
    assert.ok(
      imported.quotas && equals(ScriptQuotasSchema, imported.quotas, quotas),
    );
    target.actions.markSaved(submitted);
    assert.equal(target.document.get().isDirty, false);
  }
});

test("files without quota overrides restore defaults instead of inheriting the old script", () => {
  for (const content of [
    { nodes: [], edges: [] },
    { version: 1, nodes: [], edges: [], quotas: null, paused: true },
  ]) {
    const target = createScriptEditorSession();
    target.actions.setQuotas(
      create(ScriptQuotasSchema, {
        maxExecutionCount: 99n,
        disableTimeouts: true,
      }),
    );
    target.actions.loadScriptData(parseScriptFile(JSON.stringify(content)));
    assert.equal(target.actions.getScriptData().quotas, undefined);
    assert.equal(target.document.get().isDirty, true);
    assert.equal(
      parseScriptFile(serializeScriptFile(target.actions.getScriptData()))
        .quotas,
      undefined,
    );
  }
});

test("earlier version 1 quota exports remain importable", () => {
  const imported = parseScriptFile(
    JSON.stringify({
      version: 1,
      nodes: [],
      edges: [],
      quotas: {
        $typeName: "soulfire.v1.ScriptQuotas",
        disableTimeouts: true,
      },
    }),
  );
  assert.deepEqual(
    imported.quotas,
    create(ScriptQuotasSchema, { disableTimeouts: true }),
  );
});

test("invalid quota files fail before they can replace an editor document", () => {
  const target = createScriptEditorSession();
  target.actions.addNode("constant.number", { x: 0, y: 0 }, { value: 1 });
  const before = target.actions.getScriptData();
  for (const quotas of [
    { maxExecutionCount: "1.5" },
    { maxExecutionCount: "9223372036854775808" },
    { maxConcurrentTriggers: 2.5 },
    { disableTimeouts: "false" },
  ]) {
    assert.throws(() =>
      target.actions.loadScriptData(
        parseScriptFile(JSON.stringify({ nodes: [], edges: [], quotas })),
      ),
    );
    assert.deepEqual(target.actions.getScriptData(), before);
  }
});

test("malformed graph elements cannot replace an existing draft", () => {
  const target = createScriptEditorSession();
  target.actions.addNode("constant.number", { x: 0, y: 0 }, { value: 42 });
  const before = target.actions.getScriptData();
  const node = {
    id: "imported",
    type: "constant.number",
    position: { x: 1, y: 2 },
    data: { value: 1 },
  };
  const edge = { id: "edge", source: node.id, target: node.id };
  for (const graph of [
    ...[
      null,
      42,
      {},
      { ...node, position: null },
      { ...node, position: { x: "1", y: 2 } },
      { ...node, position: { x: 1 } },
      { ...node, data: null },
      { ...node, data: [] },
      { ...node, id: "" },
      { ...node, type: 42 },
    ].map((invalid) => ({ nodes: [invalid], edges: [] })),
    ...[
      null,
      42,
      {},
      { ...edge, id: "" },
      { ...edge, source: 42 },
      { ...edge, target: null },
      { ...edge, sourceHandle: 42 },
      { ...edge, data: [] },
    ].map((invalid) => ({ nodes: [node], edges: [invalid] })),
    { nodes: [node, node], edges: [] },
    { nodes: [node], edges: [edge, edge] },
  ]) {
    assert.throws(() =>
      target.actions.loadScriptData(parseScriptFile(JSON.stringify(graph))),
    );
    assert.deepEqual(target.actions.getScriptData(), before);
  }
  assert.throws(() =>
    parseScriptFile(
      '{"nodes":[{"id":"overflow","position":{"x":1e999,"y":0},"data":{}}],"edges":[]}',
    ),
  );
});

test("graph imports preserve unknown node types and extension data", () => {
  const graph = {
    nodes: [
      {
        id: "custom",
        type: "extension.custom",
        position: { x: -1, y: 2 },
        data: { nested: { items: [1, "世界", null] } },
        style: { opacity: 0.5 },
        extension: { revision: 2 },
      },
    ],
    edges: [
      {
        id: "self",
        source: "custom",
        target: "custom",
        sourceHandle: null,
        targetHandle: "input",
        data: { order: 3 },
        animated: true,
      },
    ],
  };
  const imported = parseScriptFile(JSON.stringify(graph));
  assert.deepEqual(imported.nodes, graph.nodes);
  assert.deepEqual(imported.edges, graph.edges);
});

test("older exported node sizes are normalized without losing frame sizes or other styles", () => {
  const session = createScriptEditorSession();
  const ordinary = {
    id: crypto.randomUUID(),
    type: "action.print",
    position: { x: 10, y: 20 },
    data: {},
    width: 180,
    height: 126,
    style: { width: 180, height: 126, opacity: 0.5 },
  };
  const frame = {
    id: crypto.randomUUID(),
    type: "layout.frame",
    position: { x: 0, y: 0 },
    data: {},
    width: 300,
    height: 200,
  };
  session.actions.loadScriptData({
    nodes: [ordinary, frame],
    edges: [],
    quotas: undefined,
  });
  const imported = parseScriptFile(
    serializeScriptFile(session.actions.getScriptData()),
  );
  assert.equal(imported.nodes[0].width, undefined);
  assert.equal(imported.nodes[0].height, undefined);
  assert.deepEqual(imported.nodes[0].style, { opacity: 0.5 });
  assert.deepEqual(imported.nodes[1], frame);
  assert.equal(ordinary.width, 180);
  assert.equal(ordinary.style.height, 126);
});

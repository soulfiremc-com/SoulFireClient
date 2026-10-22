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

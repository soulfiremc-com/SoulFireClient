import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { ScriptService } from "@/generated/soulfire/script_pb";
import { getScriptEditorRouteSession } from "@/stores/script-editor-route-session";
import { saveScript } from "./save-script";

test("saving graph edits preserves an unseen server pause and accepts its canonical value", async () => {
  const editor = getScriptEditorRouteSession(
    undefined,
    "instance",
    "script",
  ).editor;
  editor.actions.markSaved(editor.actions.getScriptData(), "script");
  editor.actions.addNode("constant.number", { x: 10, y: 20 }, { value: 2 });
  const transport = createRouterTransport((router) => {
    router.service(ScriptService, {
      updateScript(request) {
        assert.equal(request.paused, undefined);
        return { script: { id: request.scriptId, paused: true } };
      },
    });
  });
  await saveScript(transport, "instance", editor, "Untitled");
  assert.equal(editor.document.get().paused, true);
  assert.equal(editor.document.get().lastSavedPaused, true);
  assert.equal(editor.document.get().isDirty, false);
});

test("saving an explicit pause edit retains a newer pause draft during acknowledgement", async () => {
  const editor = getScriptEditorRouteSession(
    undefined,
    "instance",
    "script",
  ).editor;
  editor.actions.markSaved(editor.actions.getScriptData(), "script");
  editor.actions.setPaused(true);
  const transport = createRouterTransport((router) => {
    router.service(ScriptService, {
      updateScript(request) {
        assert.equal(request.paused, true);
        editor.actions.setPaused(false);
        return { script: { id: request.scriptId, paused: true } };
      },
    });
  });
  await saveScript(transport, "instance", editor, "Untitled");
  assert.equal(editor.document.get().paused, false);
  assert.equal(editor.document.get().lastSavedPaused, true);
  assert.equal(editor.document.get().isDirty, true);
});

test("a second save updates the assigned ID before canonical navigation finishes", async () => {
  const session = getScriptEditorRouteSession(undefined, "instance", "new");
  const editor = session.editor;
  editor.actions.setScriptName("First save");
  const nodeId = editor.actions.addNode(
    "constant.number",
    { x: 10, y: 20 },
    { value: 1 },
  );
  let acknowledge = () => {};
  const acknowledgement = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let received = () => {};
  const requestReceived = new Promise<void>((resolve) => {
    received = resolve;
  });
  let creates = 0;
  let updates = 0;
  const transport = createRouterTransport((router) => {
    router.service(ScriptService, {
      async createScript(request) {
        creates++;
        received();
        await acknowledgement;
        return {
          script: {
            id: "created-id",
            name: request.name,
            nodes: request.nodes,
          },
        };
      },
      updateScript(request) {
        updates++;
        assert.equal(request.scriptId, "created-id");
        assert.equal(request.updateNodes, true);
        assert.equal(request.updateEdges, true);
        assert.equal(request.updateQuotas, true);
        return {
          script: {
            id: request.scriptId,
            name: request.name,
            nodes: request.nodes,
          },
        };
      },
    });
  });
  const firstSave = saveScript(transport, "instance", editor, "Untitled");
  await requestReceived;
  editor.actions.setScriptName("Newer edit");
  editor.actions.updateNodeData(nodeId, { value: 2 });
  acknowledge();
  await firstSave;
  assert.equal(session.scriptId, "new");
  assert.equal(editor.document.get().scriptId, "created-id");
  assert.equal(editor.document.get().isDirty, true);
  const persisted = await saveScript(transport, "instance", editor, "Untitled");
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.equal(persisted.name, "Newer edit");
  assert.deepEqual(persisted.nodes[0].data.value.kind, {
    case: "numberValue",
    value: 2,
  });
  assert.equal(editor.document.get().isDirty, false);
  assert.equal(
    getScriptEditorRouteSession(session, "instance", "created-id").editor,
    editor,
  );
});

test("failed creation leaves the draft available for a genuine create retry", async () => {
  const editor = getScriptEditorRouteSession(
    undefined,
    "instance",
    "new",
  ).editor;
  editor.actions.setScriptName("Retry");
  let attempts = 0;
  const transport = createRouterTransport((router) => {
    router.service(ScriptService, {
      createScript(request) {
        if (++attempts === 1)
          throw new ConnectError("Unavailable", Code.Unavailable);
        return { script: { id: "retry-id", name: request.name } };
      },
    });
  });
  await assert.rejects(saveScript(transport, "instance", editor, "Untitled"));
  assert.equal(editor.document.get().scriptId, null);
  assert.equal(editor.document.get().isDirty, true);
  await saveScript(transport, "instance", editor, "Untitled");
  assert.equal(attempts, 2);
  assert.equal(editor.document.get().scriptId, "retry-id");
  assert.equal(editor.document.get().isDirty, false);
});

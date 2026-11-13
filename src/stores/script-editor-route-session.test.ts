import assert from "node:assert/strict";
import { test } from "node:test";
import { getScriptEditorRouteSession } from "./script-editor-route-session";

test("canonical create navigation retains newer edits while other documents stay isolated", () => {
  const pending = getScriptEditorRouteSession(undefined, "instance", "new");
  pending.editor.actions.setScriptName("Submitted");
  const submitted = pending.editor.actions.getScriptData();
  pending.editor.actions.setScriptName("Newer edit");
  pending.editor.actions.markSaved(submitted, "created-id");
  const created = getScriptEditorRouteSession(
    pending,
    "instance",
    "created-id",
  );
  assert.equal(created.editor, pending.editor);
  assert.equal(created.key, pending.key);
  assert.equal(created.editor.document.get().scriptName, "Newer edit");
  assert.equal(created.editor.document.get().isDirty, true);
  assert.equal(
    getScriptEditorRouteSession(created, "instance", "created-id"),
    created,
  );
  for (const next of [
    getScriptEditorRouteSession(created, "instance", "other-id"),
    getScriptEditorRouteSession(created, "other-instance", "created-id"),
    getScriptEditorRouteSession(created, "instance", "new"),
  ]) {
    assert.notEqual(next.editor, created.editor);
    assert.notEqual(next.key, created.key);
    assert.equal(next.editor.document.get().scriptId, null);
    assert.equal(next.editor.document.get().nodes.length, 0);
  }
  const unrelated = getScriptEditorRouteSession(
    pending,
    "instance",
    "unrelated-id",
  );
  assert.notEqual(unrelated.editor, pending.editor);
});

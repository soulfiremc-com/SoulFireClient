import assert from "node:assert/strict";
import { test } from "node:test";
import { ScriptGroupViewports } from "./script-group-viewports";

test("group navigation fits new contexts and restores each visited view", () => {
  const history = new ScriptGroupViewports();
  const root = { x: -8_000, y: -6_000, zoom: 0.5 };
  const outer = { x: 12, y: 80, zoom: 0.8 };
  const inner = { x: 3_000, y: -2_000, zoom: 1.2 };
  assert.equal(history.initialized, false);
  assert.deepEqual(history.enter(null, root), { type: "fit" });
  history.completeFit(null);
  assert.equal(history.initialized, true);
  assert.deepEqual(history.enter("outer", root), { type: "fit" });
  history.completeFit("outer");
  assert.deepEqual(history.enter("inner", outer), { type: "fit" });
  history.completeFit("inner");
  assert.deepEqual(history.enter(null, inner), {
    type: "restore",
    viewport: root,
  });
  assert.deepEqual(history.enter("outer", root), {
    type: "restore",
    viewport: outer,
  });
  assert.deepEqual(history.enter("inner", outer), {
    type: "restore",
    viewport: inner,
  });
});

test("staying in a context leaves its camera alone and saves the latest user movement", () => {
  const history = new ScriptGroupViewports();
  const initial = { x: 0, y: 0, zoom: 1 };
  const moved = { x: 90, y: -180, zoom: 0.7 };
  history.enter(null, initial);
  history.completeFit(null);
  assert.deepEqual(history.enter(null, moved), { type: "unchanged" });
  history.enter("group", moved);
  history.completeFit("group");
  assert.deepEqual(history.enter(null, initial), {
    type: "restore",
    viewport: moved,
  });
});

test("leaving before a queued fit finishes does not save the parent's camera as the group view", () => {
  const history = new ScriptGroupViewports();
  const root = { x: -900, y: 80, zoom: 0.6 };
  history.enter(null, root);
  history.completeFit(null);
  history.enter("group", root);
  assert.deepEqual(history.enter(null, root), {
    type: "restore",
    viewport: root,
  });
  history.completeFit("group");
  assert.deepEqual(history.enter("group", root), { type: "fit" });
});

test("root and a group named root keep independent copied viewports", () => {
  const history = new ScriptGroupViewports();
  const root = { x: 20, y: 40, zoom: 1 };
  const group = { x: -300, y: 200, zoom: 0.25 };
  history.enter(null, root);
  history.completeFit(null);
  history.enter("root", root);
  history.completeFit("root");
  root.x = 999;
  const restored = history.enter(null, group);
  assert.deepEqual(restored, {
    type: "restore",
    viewport: { x: 20, y: 40, zoom: 1 },
  });
  if (restored.type !== "restore") assert.fail();
  restored.viewport.x = 30;
  assert.deepEqual(history.enter("root", restored.viewport), {
    type: "restore",
    viewport: group,
  });
  assert.deepEqual(history.enter(null, group), {
    type: "restore",
    viewport: { x: 30, y: 40, zoom: 1 },
  });
});

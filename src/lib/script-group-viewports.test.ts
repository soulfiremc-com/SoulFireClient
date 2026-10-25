import assert from "node:assert/strict";
import { test } from "node:test";
import { ScriptGroupViewports } from "./script-group-viewports";

test("group navigation fits new contexts and restores each visited view", () => {
  const history = new ScriptGroupViewports();
  const root = { x: -8_000, y: -6_000, zoom: 0.5 };
  const outer = { x: 12, y: 80, zoom: 0.8 };
  const inner = { x: 3_000, y: -2_000, zoom: 1.2 };
  assert.equal(history.initialized, false);
  assert.deepEqual(history.enter(null, root, 0), { type: "fit" });
  history.completeFit(null, 0);
  assert.equal(history.initialized, true);
  assert.deepEqual(history.enter("outer", root, 0), { type: "fit" });
  history.completeFit("outer", 0);
  assert.deepEqual(history.enter("inner", outer, 0), { type: "fit" });
  history.completeFit("inner", 0);
  assert.deepEqual(history.enter(null, inner, 0), {
    type: "restore",
    viewport: root,
  });
  assert.deepEqual(history.enter("outer", root, 0), {
    type: "restore",
    viewport: outer,
  });
  assert.deepEqual(history.enter("inner", outer, 0), {
    type: "restore",
    viewport: inner,
  });
});

test("staying in a context leaves its camera alone and saves the latest user movement", () => {
  const history = new ScriptGroupViewports();
  const initial = { x: 0, y: 0, zoom: 1 };
  const moved = { x: 90, y: -180, zoom: 0.7 };
  history.enter(null, initial, 0);
  history.completeFit(null, 0);
  assert.deepEqual(history.enter(null, moved, 0), { type: "unchanged" });
  history.enter("group", moved, 0);
  history.completeFit("group", 0);
  assert.deepEqual(history.enter(null, initial, 0), {
    type: "restore",
    viewport: moved,
  });
});

test("leaving before a queued fit finishes does not save the parent's camera as the group view", () => {
  const history = new ScriptGroupViewports();
  const root = { x: -900, y: 80, zoom: 0.6 };
  history.enter(null, root, 0);
  history.completeFit(null, 0);
  history.enter("group", root, 0);
  assert.deepEqual(history.enter(null, root, 0), {
    type: "restore",
    viewport: root,
  });
  history.completeFit("group", 0);
  assert.deepEqual(history.enter("group", root, 0), { type: "fit" });
});

test("root and a group named root keep independent copied viewports", () => {
  const history = new ScriptGroupViewports();
  const root = { x: 20, y: 40, zoom: 1 };
  const group = { x: -300, y: 200, zoom: 0.25 };
  history.enter(null, root, 0);
  history.completeFit(null, 0);
  history.enter("root", root, 0);
  history.completeFit("root", 0);
  root.x = 999;
  const restored = history.enter(null, group, 0);
  assert.deepEqual(restored, {
    type: "restore",
    viewport: { x: 20, y: 40, zoom: 1 },
  });
  if (restored.type !== "restore") assert.fail();
  restored.viewport.x = 30;
  assert.deepEqual(history.enter("root", restored.viewport, 0), {
    type: "restore",
    viewport: group,
  });
  assert.deepEqual(history.enter(null, group, 0), {
    type: "restore",
    viewport: { x: 30, y: 40, zoom: 1 },
  });
});

test("document replacement discards old views and ignores old fit completions", () => {
  const history = new ScriptGroupViewports();
  const root = { x: 0, y: 0, zoom: 1 };
  const group = { x: 20, y: 30, zoom: 0.5 };
  history.enter(null, root, 0);
  history.completeFit(null, 0);
  history.enter("group", root, 0);
  history.completeFit("group", 0);

  assert.deepEqual(history.enter(null, group, 1), { type: "fit" });
  history.completeFit(null, 0);
  assert.deepEqual(history.enter("group", root, 1), { type: "fit" });
  history.completeFit("group", 0);
  assert.deepEqual(history.enter(null, group, 1), { type: "fit" });
  history.completeFit(null, 1);
  assert.deepEqual(history.enter("group", root, 1), { type: "fit" });
});

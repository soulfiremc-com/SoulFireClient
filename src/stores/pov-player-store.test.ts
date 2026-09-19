import assert from "node:assert/strict";
import { test } from "node:test";
import { createPovPlayerStore } from "./pov-player-store";

test("released capture attempts cannot capture a later session", () => {
  const store = createPovPlayerStore();
  store.actions.framePresented(false);
  const first = store.actions.beginCapture();
  assert.ok(first !== null);
  assert.equal(store.actions.beginCapture(), null);
  store.actions.releaseCapture();
  const second = store.actions.beginCapture();
  assert.ok(second !== null);
  assert.equal(store.actions.completeCapture(first), false);
  assert.equal(store.actions.completeCapture(second), true);
  assert.equal(store.get().capture, "captured");
});

test("repeated frames do not publish redundant UI updates", () => {
  const store = createPovPlayerStore();
  let updates = 0;
  const sub = store.subscribe(() => updates++);
  store.actions.framePresented(false);
  for (let i = 0; i < 60; i++) store.actions.framePresented(false);
  assert.equal(updates, 1);
  assert.equal(store.actions.framePresented(true), true);
  assert.equal(updates, 2);
  sub.unsubscribe();
});

test("disconnected players cannot finish pending capture", () => {
  const store = createPovPlayerStore();
  assert.equal(store.actions.beginCapture(), null);
  store.actions.framePresented(false);
  const attempt = store.actions.beginCapture();
  assert.ok(attempt !== null);
  store.actions.disconnected();
  assert.equal(store.actions.completeCapture(attempt), false);
  store.actions.releaseCapture();
  assert.equal(store.get().capture, "idle");
  assert.equal(createPovPlayerStore().get().connected, false);
});

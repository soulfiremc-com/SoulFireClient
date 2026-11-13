import assert from "node:assert/strict";
import { test } from "node:test";
import { PovInputEvent_Kind as Kind } from "@/generated/soulfire/pov_pb";
import { PovGamepad } from "./pov-gamepad";

test("gamepad emits edges, applies a deadzone and releases on disconnect", () => {
  const mapper = new PovGamepad();
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: i === 0,
    touched: false,
    value: 0,
  }));
  const pad = {
    mapping: "standard",
    axes: [0, -1, 0.1, 0],
    buttons,
  } as unknown as Gamepad;
  let events = mapper.sample(pad, 1 / 60, false);
  assert.equal(
    events.filter((e) => e.kind === Kind.KEY && e.action === 1).length,
    2,
  );
  assert.equal(
    events.some((e) => e.kind === Kind.MOVE),
    false,
  );
  assert.equal(mapper.sample(pad, 1 / 60, false).length, 0);
  events = mapper.sample(null, 1 / 60, false);
  assert.equal(events.filter((e) => e.action === 0).length, 2);
  assert.equal(mapper.sample(null, 1 / 60, false).length, 0);
});

const controller = (...pressed: number[]) =>
  ({
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressed.includes(index),
      touched: false,
      value: 0,
    })),
  }) as unknown as Gamepad;

const edges = (mapper: PovGamepad, screen: boolean, ...pressed: number[]) =>
  mapper
    .sample(controller(...pressed), 1 / 60, screen)
    .map(({ kind, code, action }) => ({ kind, code, action }));

test("held crouch cannot become Back when opening inventory", () => {
  const mapper = new PovGamepad();
  edges(mapper, false, 1, 3);
  assert.deepEqual(edges(mapper, true, 1, 3), [
    { kind: Kind.KEY, code: 340, action: 0 },
    { kind: Kind.KEY, code: 69, action: 0 },
  ]);
  assert.deepEqual(edges(mapper, true, 1, 3), []);
  edges(mapper, true, 3);
  assert.deepEqual(edges(mapper, true, 1, 3), [
    { kind: Kind.KEY, code: 256, action: 1 },
  ]);
  assert.deepEqual(edges(mapper, false, 1, 3), [
    { kind: Kind.KEY, code: 256, action: 0 },
  ]);
  edges(mapper, false);
  assert.deepEqual(edges(mapper, false, 1), [
    { kind: Kind.KEY, code: 340, action: 1 },
  ]);
});

test("screen changes release held clicks and accept newly pressed buttons", () => {
  const mapper = new PovGamepad();
  edges(mapper, false, 0, 6, 7);
  assert.deepEqual(edges(mapper, true, 0, 6, 7), [
    { kind: Kind.KEY, code: 32, action: 0 },
    { kind: Kind.BUTTON, code: 0, action: 0 },
    { kind: Kind.BUTTON, code: 1, action: 0 },
  ]);
  edges(mapper, true, 6, 7);
  assert.deepEqual(edges(mapper, true, 0, 6, 7), [
    { kind: Kind.BUTTON, code: 0, action: 1 },
  ]);
  assert.deepEqual(edges(mapper, false, 0, 6, 7), [
    { kind: Kind.BUTTON, code: 0, action: 0 },
  ]);
  edges(mapper, false);
  assert.deepEqual(edges(mapper, true, 0), [
    { kind: Kind.BUTTON, code: 0, action: 1 },
  ]);
});

test("reset and controller disconnect clear buttons blocked by a screen change", () => {
  const mapper = new PovGamepad();
  edges(mapper, false, 0);
  edges(mapper, true, 0);
  mapper.reset();
  assert.deepEqual(edges(mapper, true, 0), [
    { kind: Kind.BUTTON, code: 0, action: 1 },
  ]);
  edges(mapper, false, 0);
  mapper.sample(null, 1 / 60, false);
  assert.deepEqual(edges(mapper, false, 0), [
    { kind: Kind.KEY, code: 32, action: 1 },
  ]);
});

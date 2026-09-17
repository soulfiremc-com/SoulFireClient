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

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type PovInputEvent,
  PovInputEvent_Kind as Kind,
} from "@/generated/soulfire/pov_pb";
import { PovTouchInput } from "./pov-touch-input";

const actions = (events: PovInputEvent[]) =>
  events.map(({ kind, code, action }) => [kind, code, action]);

test("changing joystick direction releases only the keys no longer held", () => {
  const input = new PovTouchInput();
  input.update(1, [{ code: 87 }, { code: 65 }]);
  assert.deepEqual(actions(input.update(1, [{ code: 87 }, { code: 68 }])), [
    [Kind.KEY, 65, 0],
    [Kind.KEY, 68, 1],
  ]);
  assert.deepEqual(actions(input.release(1)), [
    [Kind.KEY, 87, 0],
    [Kind.KEY, 68, 0],
  ]);
  assert.deepEqual(input.release(1), []);
});

test("a shared key or button remains held until every finger releases it", () => {
  for (const mouse of [false, true]) {
    const input = new PovTouchInput();
    const control = { code: mouse ? 0 : 340, mouse };
    const kind = mouse ? Kind.BUTTON : Kind.KEY;
    assert.deepEqual(actions(input.update(1, [control])), [
      [kind, control.code, 1],
    ]);
    assert.deepEqual(input.update(2, [control]), []);
    assert.deepEqual(input.release(1), []);
    assert.deepEqual(actions(input.release(2)), [[kind, control.code, 0]]);
  }
});

test("a screen change releases every held control and allows inventory to reopen", () => {
  const input = new PovTouchInput();
  input.update(1, [{ code: 340 }]);
  input.update(2, [{ code: 69 }]);
  input.update(3, [{ code: 0, mouse: true }]);
  assert.deepEqual(actions(input.reset()), [
    [Kind.KEY, 340, 0],
    [Kind.KEY, 69, 0],
    [Kind.BUTTON, 0, 0],
  ]);
  assert.deepEqual(input.release(2), []);
  assert.deepEqual(input.reset(), []);
  assert.deepEqual(actions(input.update(2, [{ code: 69 }])), [
    [Kind.KEY, 69, 1],
  ]);
});

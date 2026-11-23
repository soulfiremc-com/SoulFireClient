import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type PovInputEvent,
  PovInputEvent_Kind as Kind,
} from "@/generated/soulfire/pov_pb";
import { PovInputQueue } from "./pov-input-queue";
import {
  POV_TOUCH_CONTROLS_SOURCE,
  PovCanvasTouches,
  PovTouchInput,
} from "./pov-touch-input";

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

test("a camera drag on the canvas does not release the Attack button", () => {
  const queue = new PovInputQueue();
  const controls = new PovTouchInput();
  for (const event of controls.update(1, [{ code: 0, mouse: true }]))
    queue.enqueue(event, POV_TOUCH_CONTROLS_SOURCE);
  const canvas = new PovCanvasTouches();
  assert.equal(canvas.start(2, 10, 10, false), null);
  assert.deepEqual(canvas.move(2, 15, 7), { x: 5, y: -3 });
  assert.equal(canvas.end(2), null);
  assert.deepEqual(actions(queue.drain()), [[Kind.BUTTON, 0, 1]]);
});

test("a GUI click stays pressed until the last canvas finger lifts", () => {
  const queue = new PovInputQueue();
  const canvas = new PovCanvasTouches();
  const send = (input: ReturnType<PovCanvasTouches["end"]>) => {
    if (input) queue.enqueue(input.event, input.source);
  };
  send(canvas.start(1, 0, 0, true));
  send(canvas.start(2, 5, 5, true));
  send(canvas.end(1));
  assert.deepEqual(actions(queue.drain()), [[Kind.BUTTON, 0, 1]]);
  send(canvas.end(2));
  assert.deepEqual(actions(queue.drain()), [[Kind.BUTTON, 0, 0]]);
  assert.equal(canvas.end(2), null);
  assert.equal(canvas.move(2, 1, 1), null);
});

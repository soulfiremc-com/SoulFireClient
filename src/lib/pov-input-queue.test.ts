import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  PovInputEvent_Kind as Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";
import { PovInputQueue } from "./pov-input-queue";
import { keyInput } from "./pov-input";

const move = (x: number, y = 0, relative = false) =>
  create(PovInputEventSchema, { kind: Kind.MOVE, x, y, relative });
const button = (code: number, action: number) =>
  create(PovInputEventSchema, { kind: Kind.BUTTON, code, action });

test("hover keeps the latest position and camera motion retains its total delta", () => {
  const queue = new PovInputQueue();
  queue.enqueue(
    create(PovInputEventSchema, { kind: Kind.KEY, code: 87, action: 1 }),
    "keyboard",
  );
  queue.drain();
  queue.enqueue(move(0.1, 0.2), "mouse");
  queue.enqueue(move(0.3, 0.4), "mouse");
  const hover = queue.drain();
  assert.equal(hover.length, 1);
  assert.deepEqual([hover[0]!.x, hover[0]!.y], [0.3, 0.4]);
  queue.enqueue(button(0, 1), "mouse");
  queue.drain();
  queue.enqueue(move(2, -4, true), "mouse");
  queue.enqueue(move(-1, 7, true), "mouse");
  const camera = queue.drain();
  assert.equal(camera.length, 1);
  assert.deepEqual([camera[0]!.x, camera[0]!.y], [1, 3]);
});

test("dragging preserves every crossed slot across input batches", () => {
  for (const code of [0, 1, 2, 4]) {
    const queue = new PovInputQueue();
    queue.enqueue(button(code, 1), "mouse");
    queue.drain();
    for (const x of [0.1, 0.3, 0.5]) queue.enqueue(move(x), "mouse");
    queue.enqueue(button(code, 0), "mouse");
    const received = queue.drain();
    assert.deepEqual(
      received
        .filter((event) => event.kind === Kind.MOVE)
        .map((event) => event.x),
      [0.1, 0.3, 0.5],
    );
    assert.equal(received[received.length - 1]?.kind, Kind.BUTTON);
    assert.equal(received[received.length - 1]?.action, 0);
    queue.enqueue(move(0.6), "mouse");
    queue.enqueue(move(0.7), "mouse");
    assert.equal(queue.drain().length, 1);
  }
});

test("a drag ends only when every input device releases its button", () => {
  const queue = new PovInputQueue();
  queue.enqueue(button(0, 1), "mouse");
  queue.enqueue(button(0, 1), "gamepad");
  assert.equal(queue.drain().length, 1);
  queue.enqueue(button(0, 0), "mouse");
  queue.enqueue(move(0.1), "gamepad");
  queue.enqueue(move(0.2), "gamepad");
  assert.equal(queue.drain().length, 2);
  queue.enqueue(button(0, 0), "gamepad");
  queue.drain();
  queue.enqueue(move(0.3), "mouse");
  queue.enqueue(move(0.4), "mouse");
  assert.equal(queue.drain().length, 1);
});

test("releasing capture clears queued events and held input ownership", () => {
  const queue = new PovInputQueue();
  queue.enqueue(button(1, 1), "touch");
  queue.enqueue(move(0.1), "touch");
  queue.reset();
  assert.equal(queue.length, 0);
  queue.enqueue(move(0.2), "mouse");
  queue.enqueue(move(0.3), "mouse");
  assert.equal(queue.drain().length, 1);
  queue.enqueue(button(1, 1), "touch");
  assert.equal(queue.drain().length, 1);
});

test("input stays bounded and can reset after overflow", () => {
  const queue = new PovInputQueue();
  const event = () =>
    create(PovInputEventSchema, { kind: Kind.CHARACTER, code: 65 });
  for (let i = 0; i < 128; i++)
    assert.equal(queue.enqueue(event(), "keyboard"), true);
  assert.equal(queue.isFull, true);
  assert.equal(queue.enqueue(event(), "keyboard"), false);
  assert.equal(queue.length, 128);
  queue.reset();
  assert.equal(queue.isFull, false);
  assert.equal(queue.enqueue(event(), "keyboard"), true);
  assert.equal(queue.drain().length, 1);
});

test("modifier changes still release keys that the keyboard owns", () => {
  const queue = new PovInputQueue();
  const event = {
    code: "KeyW",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  };
  const down = keyInput(event, true, false);
  assert.ok(down);
  queue.enqueue(down, "keyboard");
  queue.drain();
  const up = keyInput({ ...event, metaKey: true }, false, false);
  if (up) queue.enqueue(up, "keyboard");
  const batch = queue.drain();
  assert.deepEqual(
    batch.map(({ code, action }) => [code, action]),
    [[87, 0]],
  );
});

test("system key releases neither invent ownership nor cancel another device", () => {
  const queue = new PovInputQueue();
  const event = {
    code: "KeyW",
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  };
  assert.equal(keyInput(event, true, false), null);
  const orphan = keyInput(event, false, false);
  if (orphan) queue.enqueue(orphan, "keyboard");
  assert.equal(queue.length, 0);
  queue.enqueue(
    create(PovInputEventSchema, { kind: Kind.KEY, code: 87, action: 1 }),
    "gamepad",
  );
  queue.drain();
  const down = keyInput({ ...event, metaKey: false }, true, false);
  assert.ok(down);
  queue.enqueue(down, "keyboard");
  const up = keyInput(event, false, false);
  assert.ok(up);
  queue.enqueue(up, "keyboard");
  assert.equal(queue.length, 0);
  queue.enqueue(
    create(PovInputEventSchema, { kind: Kind.KEY, code: 87, action: 0 }),
    "gamepad",
  );
  assert.deepEqual(
    queue.drain().map(({ code, action }) => [code, action]),
    [[87, 0]],
  );
});

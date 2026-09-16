import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { PovFrameSchema } from "@/generated/soulfire/pov_pb";
import { PovStreamFeedbackTracker } from "./pov-stream-feedback";

const stats = { queued: 1, pending: 3, recoveries: 2 };
const frame = (sequence: number, milliseconds: number) =>
  create(PovFrameSchema, {
    sequence: BigInt(sequence),
    timestampUs: BigInt(milliseconds * 1000),
  });

test("feedback removes clock offset and tracks extra delivery delay without depending on FPS", () => {
  const tracker = new PovStreamFeedbackTracker();
  tracker.receive(frame(1, 1000), 20000);
  assert.equal(tracker.sample(stats).deliveryDelayMs, 0);
  tracker.receive(frame(2, 2000), 21000);
  assert.equal(tracker.sample(stats).deliveryDelayMs, 0);
  tracker.receive(frame(3, 2100), 21300);
  const delayed = tracker.sample(stats);
  assert.equal(delayed.deliveryDelayMs, 200);
  assert.equal(delayed.decoderQueueSize, 3);
  assert.equal(delayed.decoderRecoveries, 2);
  assert.equal(delayed.receivedSequence, 3n);
  tracker.receive(frame(4, 2200), 21200);
  assert.equal(tracker.sample(stats).deliveryDelayMs, 0);
});

test("feedback resets its baseline and sequence when the server stream restarts", () => {
  const tracker = new PovStreamFeedbackTracker();
  tracker.receive(frame(100, 5000), 6000);
  tracker.reset();
  assert.equal(tracker.sample(stats).receivedSequence, 0n);
  tracker.receive(frame(1, 0), 9000);
  assert.equal(tracker.sample(stats).deliveryDelayMs, 0);
  assert.equal(tracker.sample(stats).receivedSequence, 1n);
});

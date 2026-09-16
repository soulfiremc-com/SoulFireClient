import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { PovFrameSchema } from "@/generated/soulfire/pov_pb";
import { PovStreamMetrics } from "./pov-stream-metrics";

test("stream metrics use elapsed time, count payload bytes, and report stalls", () => {
  const metrics = new PovStreamMetrics(0);
  const first = create(PovFrameSchema, {
    sequence: 1n,
    data: new Uint8Array(1024),
    keyFrame: true,
  });
  const second = create(PovFrameSchema, {
    sequence: 2n,
    data: new Uint8Array(3072),
  });
  metrics.receive(first, 100);
  metrics.draw(first, 110);
  metrics.receive(second, 200);
  metrics.draw(second, 230);
  const stats = metrics.sample(2000);
  assert.equal(stats.receivedFps, 1);
  assert.equal(stats.drawnFps, 1);
  assert.equal(stats.mbps, (4096 * 8) / 2 / 1_000_000);
  assert.equal(stats.frameKiB, 2);
  assert.equal(stats.keyframes, 0.5);
  assert.equal(stats.receiveToDrawMs, 20);
  assert.equal(stats.frameAgeMs, 1800);
  const stalled = metrics.sample(3000);
  assert.equal(stalled.receivedFps, 0);
  assert.equal(stalled.drawnFps, 0);
  assert.equal(stalled.mbps, 0);
  assert.equal(stalled.receiveToDrawMs, null);
  assert.equal(stalled.frameAgeMs, 2800);
});

test("reconnect clears timing associations and samples reflect decoder backlog", () => {
  const metrics = new PovStreamMetrics(0);
  const frame = create(PovFrameSchema, { sequence: 1n });
  metrics.receive(frame, 10);
  metrics.reconnect();
  metrics.draw(frame, 100);
  metrics.decoder = () => ({ queued: 2, pending: 3, waitingForKey: true });
  const stats = metrics.sample(1000);
  assert.equal(stats.receiveToDrawMs, null);
  assert.equal(stats.queued, 2);
  assert.equal(stats.pending, 3);
  assert.equal(stats.waitingForKey, true);
});

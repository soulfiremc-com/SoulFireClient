import assert from "node:assert/strict";
import { test } from "node:test";
import { downsampleTimeSeriesData, padSnapshots } from "./metrics-utils";

const at = (ms: number) => ({
  timestamp: {
    $typeName: "google.protobuf.Timestamp" as const,
    seconds: BigInt(Math.floor(ms / 1000)),
    nanos: (ms % 1000) * 1_000_000,
  },
});

test("snapshots off the client's 3-second phase fill consecutive slots", () => {
  // The server samples 1.5 seconds out of phase, with small jitter.
  const base = 1_700_000_001_500;
  const snapshots = [0, 1, 2, 3, 4, 5].map((index) =>
    at(base + index * 3000 + (index % 2 === 0 ? -20 : 20)),
  );
  const padded = padSnapshots(snapshots, base + 15_000);
  const filled = padded.slice(-6).map((slot) => slot.snapshot);
  assert.deepEqual(filled, snapshots);
});

test("a server clock ahead of the client still shows its newest snapshot", () => {
  const clientNow = 1_700_000_000_000;
  const newest = at(clientNow + 60_000);
  const padded = padSnapshots([at(clientNow + 57_000), newest], clientNow);
  assert.equal(padded.at(-1)?.snapshot, newest);
  assert.equal(padded.length, 600);
});

test("downsampling keeps a bucket's data when its last slot is empty", () => {
  const data = Array.from({ length: 10 }, (_, index) => ({
    timestampMs: index,
    timeLabel: String(index),
    value: index === 4 || index === 9 ? null : index,
  }));
  assert.deepEqual(
    downsampleTimeSeriesData(data, { maxPoints: 2 }).map(
      (point) => point.value,
    ),
    [3, 8, null],
  );
});

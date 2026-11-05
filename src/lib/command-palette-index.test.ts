import assert from "node:assert/strict";
import { test } from "node:test";
import { isPaletteIndexComplete, runBounded } from "./command-palette-index";

test("index tasks run in order with bounded concurrency", async () => {
  let running = 0;
  let max = 0;
  const order: number[] = [];
  const tasks = Array.from({ length: 10 }, (_, index) => async () => {
    running++;
    max = Math.max(max, running);
    order.push(index);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running--;
  });
  await runBounded(tasks, 3, new AbortController().signal);
  assert.equal(max, 3);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("aborting the index starts no further tasks", async () => {
  const controller = new AbortController();
  const started: number[] = [];
  const tasks = Array.from({ length: 10 }, (_, index) => async () => {
    started.push(index);
    if (index === 1) controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 2));
  });
  await runBounded(tasks, 2, controller.signal);
  assert.deepEqual(started, [0, 1]);
});

test("the index is complete only when every project and the server settled", () => {
  const progress = { total: 2, loaded: 1, failed: 1, server: "none" } as const;
  assert.equal(isPaletteIndexComplete(progress), true);
  assert.equal(isPaletteIndexComplete({ ...progress, loaded: 0 }), false);
  assert.equal(
    isPaletteIndexComplete({ ...progress, server: "pending" }),
    false,
  );
  assert.equal(isPaletteIndexComplete({ ...progress, server: "failed" }), true);
});

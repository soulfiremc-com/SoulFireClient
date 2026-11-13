import assert from "node:assert/strict";
import { test } from "node:test";
import { NumericRangeEditor } from "./numeric-range-editor";
import type { NumericRange } from "./numeric-setting-value";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("switching bounds includes the latest local edit while saves are pending", async () => {
  const editor = new NumericRangeEditor({ min: 2, max: 5 });
  const held = deferred();
  const writes: NumericRange[] = [];
  const commit = (value: NumericRange) => {
    writes.push(value);
    return held.promise;
  };
  editor.startEdit({ min: 2, max: 5 });
  const first = editor.save("min", 3, commit);
  const latest = editor.save("min", 4, commit);
  editor.startEdit({ min: 2, max: 5 });
  const maximum = editor.save("max", 9, commit);
  try {
    assert.deepEqual(writes, [
      { min: 3, max: 5 },
      { min: 4, max: 5 },
      { min: 4, max: 9 },
    ]);
  } finally {
    held.resolve();
    await Promise.allSettled([first, latest, maximum]);
  }
});

test("one bound retains its original opposite bound through pending overshoots and corrections", async () => {
  const editor = new NumericRangeEditor({ min: 1000, max: 3000 });
  const held = deferred();
  const writes: NumericRange[] = [];
  editor.startEdit({ min: 1000, max: 3000 });
  const pending = [45000, 4500, 1500].map((value) =>
    editor.save("min", value, (range) => {
      writes.push(range);
      return held.promise;
    }),
  );
  try {
    assert.deepEqual(writes, [
      { min: 45000, max: 45000 },
      { min: 4500, max: 4500 },
      { min: 1500, max: 3000 },
    ]);
  } finally {
    held.resolve();
    await Promise.allSettled(pending);
  }
});

test("a failed earlier write does not discard a newer pending range", async () => {
  const editor = new NumericRangeEditor({ min: 2, max: 5 });
  const firstResponse = deferred();
  const nextResponse = deferred();
  editor.startEdit({ min: 2, max: 5 });
  const failure = assert.rejects(
    editor.save("min", 3, () => firstResponse.promise),
  );
  const next = editor.save("min", 4, () => nextResponse.promise);
  let final: NumericRange | undefined;
  try {
    firstResponse.reject(new Error("Rejected"));
    await failure;
    editor.startEdit({ min: 2, max: 5 });
    await editor.save("max", 9, (range) => {
      final = range;
    });
    assert.deepEqual(final, { min: 4, max: 9 });
  } finally {
    firstResponse.resolve();
    nextResponse.resolve();
    await Promise.allSettled([failure, next]);
  }
});

test("after rejected writes settle a new edit starts from the stored range", async () => {
  const editor = new NumericRangeEditor({ min: 2, max: 5 });
  editor.startEdit({ min: 2, max: 5 });
  await assert.rejects(
    editor.save("min", 4, async () => {
      throw new Error("Rejected");
    }),
  );
  let final: NumericRange | undefined;
  editor.startEdit({ min: 2, max: 5 });
  await editor.save("max", 9, (range) => {
    final = range;
  });
  assert.deepEqual(final, { min: 2, max: 9 });
});

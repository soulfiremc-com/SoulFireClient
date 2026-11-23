import assert from "node:assert/strict";
import { test } from "node:test";
import { settleEach } from "./settle-each";

test("a failed item does not stop the items after it", async () => {
  const ran: number[] = [];
  const error = new Error("denied");
  const result = await settleEach([1, 2, 3], async (item) => {
    ran.push(item);
    if (item === 1) {
      throw error;
    }
  });

  assert.deepEqual(ran, [1, 2, 3]);
  assert.deepEqual(result.succeeded, [2, 3]);
  assert.deepEqual(result.failed, [{ item: 1, error }]);
});

test("an empty list settles with no results", async () => {
  assert.deepEqual(
    await settleEach([], async () => {
      throw new Error("never runs");
    }),
    { succeeded: [], failed: [] },
  );
});

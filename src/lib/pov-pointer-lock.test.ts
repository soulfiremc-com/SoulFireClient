import assert from "node:assert/strict";
import { test } from "node:test";
import { lockPovPointer, PovPointerLockError } from "./pov-pointer-lock.ts";

function domError(name: string, message: string) {
  return Object.assign(new Error(message), { name });
}

const cooldown = () =>
  domError(
    "SecurityError",
    "Pointer lock cannot be acquired immediately after the user has exited the lock.",
  );

function canvas(results: (Error | undefined)[]) {
  const calls: unknown[] = [];
  return {
    calls,
    target: {
      requestPointerLock: (options?: unknown) => {
        calls.push(options);
        const result = results.shift();
        return result ? Promise.reject(result) : Promise.resolve();
      },
    } as Pick<HTMLCanvasElement, "requestPointerLock">,
  };
}

test("locks with raw mouse input on the first try", async () => {
  const { calls, target } = canvas([undefined]);
  await lockPovPointer(target);
  assert.deepEqual(calls, [{ unadjustedMovement: true }]);
});

test("falls back to adjusted input when raw input is unsupported", async () => {
  const { calls, target } = canvas([
    domError("NotSupportedError", "unadjustedMovement"),
    undefined,
  ]);
  await lockPovPointer(target);
  assert.deepEqual(calls, [{ unadjustedMovement: true }, undefined]);
});

test("retries once after the post-release cooldown", async () => {
  const { calls, target } = canvas([cooldown(), undefined]);
  await lockPovPointer(target, { cooldownMs: 0 });
  assert.equal(calls.length, 2);
});

test("reports a cooldown when the retry is also blocked", async () => {
  const { target } = canvas([cooldown(), cooldown()]);
  await assert.rejects(
    lockPovPointer(target, { cooldownMs: 0 }),
    (error) =>
      error instanceof PovPointerLockError && error.reason === "cooldown",
  );
});

test("does not retry when the browser denies capture", async () => {
  const { calls, target } = canvas([
    domError(
      "SecurityError",
      "The root document of this element is not valid for pointer lock.",
    ),
  ]);
  await assert.rejects(
    lockPovPointer(target, { cooldownMs: 0 }),
    (error) =>
      error instanceof PovPointerLockError && error.reason === "denied",
  );
  assert.equal(calls.length, 1);
});

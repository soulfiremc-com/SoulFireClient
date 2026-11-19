import { TaggedError as TaggedFailure } from "effect/Schema";
import { Schema } from "effect";
/** Why the browser did not capture the mouse for the POV view. */
export type PovPointerLockFailure = "cooldown" | "timeout" | "denied";

export class PovPointerLockError extends TaggedFailure<
  PovPointerLockError,
  { readonly brand: unique symbol }
>()("PovPointerLockError", {
  reason: Schema.Literals(["cooldown", "timeout", "denied"]),
  message: Schema.String,
}) {
  static new(reason: PovPointerLockFailure) {
    return new PovPointerLockError({
      reason,
      message: `Mouse capture failed: ${reason}`,
    });
  }
}

type PointerLockTarget = Pick<HTMLCanvasElement, "requestPointerLock">;

// Chromium rejects a new lock for about one second after the user exits one,
// with "Pointer lock cannot be acquired immediately after the user has exited
// the lock". The click that started the request keeps its user activation for
// longer than that, so one delayed retry usually succeeds.
export const POINTER_LOCK_COOLDOWN_MS = 1100;
const ATTEMPT_TIMEOUT_MS = 2000;

function errorName(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : "";
}

function errorMessage(error: unknown) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "";
}

/** True for the short block browsers apply right after a lock is released. */
export function isPointerLockCooldown(error: unknown) {
  return (
    errorName(error) === "SecurityError" &&
    /immediately after|exited the lock/iu.test(errorMessage(error))
  );
}

// Raw deltas are independent of OS pointer acceleration and display scaling.
// Retry without raw input only when the platform explicitly lacks support.
async function request(canvas: PointerLockTarget) {
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
  } catch (error) {
    if (errorName(error) !== "NotSupportedError") throw error;
    await canvas.requestPointerLock();
  }
}

async function attempt(canvas: PointerLockTarget) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      request(canvas),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(PovPointerLockError.new("timeout"));
        }, ATTEMPT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Locks the mouse to the POV canvas. When the browser still blocks a new lock
 * after a recent release, waits out the block and tries once more.
 */
export async function lockPovPointer(
  canvas: PointerLockTarget,
  options: { cooldownMs?: number } = {},
) {
  try {
    await attempt(canvas);
    return;
  } catch (error) {
    if (!isPointerLockCooldown(error)) throw toLockError(error);
  }
  await wait(options.cooldownMs ?? POINTER_LOCK_COOLDOWN_MS);
  try {
    await attempt(canvas);
  } catch (error) {
    throw isPointerLockCooldown(error)
      ? PovPointerLockError.new("cooldown")
      : toLockError(error);
  }
}

function toLockError(error: unknown) {
  return error instanceof PovPointerLockError
    ? error
    : PovPointerLockError.new("denied");
}

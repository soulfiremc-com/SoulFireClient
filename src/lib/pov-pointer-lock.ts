// Raw deltas are independent of OS pointer acceleration and display scaling.
// Retry without raw input only when the platform explicitly lacks support.
async function request(canvas: HTMLCanvasElement) {
  try {
    await (
      canvas.requestPointerLock as (options: {
        unadjustedMovement: boolean;
      }) => Promise<void>
    )({ unadjustedMovement: true });
  } catch (error) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "NotSupportedError"
      )
    )
      throw error;
    await canvas.requestPointerLock();
  }
}

export async function lockPovPointer(canvas: HTMLCanvasElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      request(canvas),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Mouse capture did not complete.")),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

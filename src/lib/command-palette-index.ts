/** Projects whose metadata loads at the same time during global search. */
export const PALETTE_INDEX_CONCURRENCY = 3;
/** Metadata newer than this is reused instead of requested again. */
export const PALETTE_INDEX_STALE_MS = 120_000;
/** Unobserved metadata stays cached this long for later searches. */
export const PALETTE_INDEX_GC_MS = 30 * 60_000;

/**
 * Run tasks in order with at most `limit` running at once. After `signal`
 * aborts, no new task starts. Tasks handle their own errors.
 */
export async function runBounded(
  tasks: readonly (() => Promise<void>)[],
  limit: number,
  signal: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!signal.aborted && next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, worker),
  );
}

export type PaletteIndexProgress = {
  /** Projects in the index, excluding the project already in context. */
  total: number;
  loaded: number;
  failed: number;
  server: "none" | "pending" | "loaded" | "failed";
};

export function isPaletteIndexComplete(progress: PaletteIndexProgress) {
  return (
    progress.loaded + progress.failed >= progress.total &&
    progress.server !== "pending"
  );
}

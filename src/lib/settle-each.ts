export interface SettledEach<T> {
  succeeded: T[];
  failed: { item: T; error: unknown }[];
}

/// Runs `run` for every item at once and waits for all of them, so one
/// failure neither stops the others nor hides which items succeeded.
export async function settleEach<T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
): Promise<SettledEach<T>> {
  const settled: SettledEach<T> = { succeeded: [], failed: [] };
  await Promise.all(
    items.map(async (item) => {
      try {
        await run(item);
        settled.succeeded.push(item);
      } catch (error) {
        settled.failed.push({ item, error });
      }
    }),
  );
  return settled;
}

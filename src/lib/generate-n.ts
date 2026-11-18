/** Stable keys `1..count` for a fixed number of placeholder slots. */
export function generateN(count: number) {
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    (_, index) => index + 1,
  );
}

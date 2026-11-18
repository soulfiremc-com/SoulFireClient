/** Narrows a string from a toggle, select or protocol field to one of the known values. */
export function isOneOf<T extends string>(
  value: string | null | undefined,
  options: readonly T[],
): value is T {
  return (
    value !== undefined &&
    value !== null &&
    (options as readonly string[]).includes(value)
  );
}

/** Returns a value that must exist, and fails with `message` when it is missing. */
export function assertDefined<T>(value: T, message: string): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

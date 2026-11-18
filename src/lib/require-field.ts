/** Returns a field the server always sets, and fails loudly if a response lacks it. */
export function requireField<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`The server response is missing ${name}`);
  }
  return value;
}

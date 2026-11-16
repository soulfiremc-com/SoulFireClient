/** Parses the generator amount field. Returns null unless it is a whole number of at least 1. */
export function parseAccountAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  return Number.isSafeInteger(amount) && amount >= 1 ? amount : null;
}

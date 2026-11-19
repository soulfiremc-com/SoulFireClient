/** Parses the generator amount field. Returns null unless it is a whole number of at least 1. */
export function parseAccountAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/u.test(trimmed)) return null;
  const amount = Number(trimmed);
  return Number.isSafeInteger(amount) && amount >= 1 ? amount : null;
}

export const ACCOUNT_NUMBER_PLACEHOLDER = "%d";

/**
 * Returns the name format to generate with. A format without %d gets the
 * account number appended, so "Bot" creates Bot1, Bot2, and so on.
 * Returns null for an empty format.
 */
export function resolveNameFormat(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes(ACCOUNT_NUMBER_PLACEHOLDER)
    ? trimmed
    : `${trimmed}${ACCOUNT_NUMBER_PLACEHOLDER}`;
}

/** Builds the username for one account number from a resolved name format. */
export function formatAccountName(nameFormat: string, accountNumber: number) {
  return nameFormat.replace(ACCOUNT_NUMBER_PLACEHOLDER, String(accountNumber));
}

/**
 * The most accounts one generation can create. The client builds every name
 * before it sends the request, so a larger amount would freeze the page.
 */
export const MAX_GENERATED_ACCOUNTS = 100_000;

/** Parses the generator amount field. Returns null unless it is a whole number from 1 to MAX_GENERATED_ACCOUNTS. */
export function parseAccountAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/u.test(trimmed)) return null;
  const amount = Number(trimmed);
  return amount >= 1 && amount <= MAX_GENERATED_ACCOUNTS ? amount : null;
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

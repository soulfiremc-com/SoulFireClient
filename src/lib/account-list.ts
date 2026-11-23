import type { ProfileAccount } from "@/lib/types.ts";

/**
 * Gives incoming accounts the per-account config and metadata of the saved
 * account with the same profile ID. A fresh sign-in returns both empty, and
 * the server replaces a saved account as a whole, so a re-import would
 * otherwise wipe them.
 */
export function keepExistingAccountState(
  existing: readonly ProfileAccount[],
  incoming: readonly ProfileAccount[],
): ProfileAccount[] {
  const byId = new Map(existing.map((account) => [account.profileId, account]));
  return incoming.map((account) => {
    const saved = byId.get(account.profileId);
    if (saved === undefined) return account;
    return {
      ...account,
      config: account.config.length > 0 ? account.config : saved.config,
      persistentMetadata:
        account.persistentMetadata.length > 0
          ? account.persistentMetadata
          : saved.persistentMetadata,
    };
  });
}

export function mergeAccounts(
  accounts: ProfileAccount[],
  incoming: ProfileAccount[],
): ProfileAccount[] {
  const byId = new Map(accounts.map((account) => [account.profileId, account]));
  for (const account of keepExistingAccountState(accounts, incoming)) {
    byId.set(account.profileId, account);
  }
  return [...byId.values()];
}

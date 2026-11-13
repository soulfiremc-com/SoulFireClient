import type { ProfileAccount } from "@/lib/types.ts";

export function mergeAccounts(
  accounts: ProfileAccount[],
  incoming: ProfileAccount[],
): ProfileAccount[] {
  const byId = new Map(accounts.map((account) => [account.profileId, account]));
  for (const account of incoming) {
    byId.set(account.profileId, account);
  }
  return [...byId.values()];
}

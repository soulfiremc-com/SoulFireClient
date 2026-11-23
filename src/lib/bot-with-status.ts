import {
  BotConnectionPhase,
  type BotListEntry,
} from "@/generated/soulfire/bot_pb";
import type { InstanceInfoQueryData } from "@/lib/types.ts";

type ProfileAccount = InstanceInfoQueryData["profile"]["accounts"][number];

export type BotWithStatus = ProfileAccount & {
  isOnline: boolean;
  connectionPhase: BotConnectionPhase;
  pingMs?: number | undefined;
  accountName?: string | undefined;
  liveState?: BotListEntry["liveState"] | undefined;
  status?: BotListEntry["status"] | undefined;
};

/** Combines an account with its live list entry. Accounts without an entry read as disconnected. */
export function withBotStatus(
  account: ProfileAccount,
  status: BotListEntry | undefined,
): BotWithStatus {
  return {
    ...account,
    isOnline: status?.isOnline ?? false,
    connectionPhase: status?.connectionPhase ?? BotConnectionPhase.DISCONNECTED,
    pingMs: status?.pingMs,
    accountName: status?.accountName,
    liveState: status?.liveState,
    status: status?.status,
  };
}

/**
 * The name the UI shows for a bot: the name the server reports, then the last
 * name SoulFire saw for the account, then the profile ID.
 */
export function botDisplayName(
  account: Pick<ProfileAccount, "lastKnownName"> | undefined,
  entry: Pick<BotListEntry, "accountName" | "profileId"> | undefined,
): string {
  return entry?.accountName || account?.lastKnownName || entry?.profileId || "";
}

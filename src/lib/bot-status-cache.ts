import { create } from "@bufbuild/protobuf";
import { replaceEqualDeep } from "@tanstack/react-query";
import {
  BotConnectionPhase,
  type BotListEntry,
  type BotListResponse,
  BotListResponseSchema,
  BotRuntimeState,
  type BotStatus,
} from "@/generated/soulfire/bot_pb";

function applyStatus(bot: BotListEntry, status: BotStatus): BotListEntry {
  switch (status.runtimeState) {
    case BotRuntimeState.STOPPED:
    case BotRuntimeState.FAILED:
    case BotRuntimeState.RETRYING:
      return {
        ...bot,
        status,
        isOnline: false,
        connectionPhase: BotConnectionPhase.DISCONNECTED,
        liveState: undefined,
        pingMs: undefined,
      };
    default:
      return { ...bot, status };
  }
}

export function shareBotListData(current: unknown, incoming: unknown) {
  return replaceEqualDeep(
    current,
    reconcileBotList(
      current as BotListResponse | undefined,
      incoming as BotListResponse,
    ),
  );
}

function isNewerStatus(
  current: BotStatus | undefined,
  incoming: BotStatus | undefined,
) {
  const previousTime = current?.updatedAt;
  const nextTime = incoming?.updatedAt;
  return (
    !!previousTime &&
    !!nextTime &&
    (previousTime.seconds > nextTime.seconds ||
      (previousTime.seconds === nextTime.seconds &&
        previousTime.nanos > nextTime.nanos))
  );
}

/// List responses provide membership and live details, but may have started
/// before a newer lifecycle event reached the cache.
function reconcileBotList(
  current: BotListResponse | undefined,
  incoming: BotListResponse,
): BotListResponse {
  if (!current) return incoming;
  const statuses = new Map(
    current.bots.map((bot) => [bot.profileId, bot.status]),
  );
  return create(BotListResponseSchema, {
    ...incoming,
    bots: incoming.bots.map((bot) => {
      const status = statuses.get(bot.profileId);
      return status && isNewerStatus(status, bot.status)
        ? applyStatus(bot, status)
        : bot;
    }),
  });
}

// Snapshots define membership. Connection details and fleet counts still come
// from the server's list queries, since a status event only carries lifecycle data.
export function reconcileBotStatuses(
  current: BotListResponse | undefined,
  statuses: readonly BotStatus[],
  snapshot: boolean,
  removedBotId?: string,
): BotListResponse | undefined {
  if (!current) return current;
  const statusById = new Map(
    statuses.map((status) => [status.profileId, status]),
  );
  return create(BotListResponseSchema, {
    bots: current.bots
      .filter(
        (bot) =>
          bot.profileId !== removedBotId &&
          (!snapshot || statusById.has(bot.profileId)),
      )
      .map((bot) => {
        const status = statusById.get(bot.profileId);
        if (!status) return bot;
        if (isNewerStatus(bot.status, status)) {
          return bot;
        }
        return applyStatus(bot, status);
      }),
  });
}

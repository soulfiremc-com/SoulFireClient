import { create } from "@bufbuild/protobuf";
import {
  type BotListResponse,
  BotListResponseSchema,
  type BotStatus,
} from "@soulfiremc/sdk/generated/soulfire/bot_pb";

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
        const previousTime = bot.status?.updatedAt;
        const nextTime = status.updatedAt;
        if (
          previousTime &&
          nextTime &&
          (previousTime.seconds > nextTime.seconds ||
            (previousTime.seconds === nextTime.seconds &&
              previousTime.nanos > nextTime.nanos))
        ) {
          return bot;
        }
        return { ...bot, status };
      }),
  });
}

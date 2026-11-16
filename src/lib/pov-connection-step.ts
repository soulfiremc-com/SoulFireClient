import {
  BotDesiredState,
  type BotInfoResponse,
  BotRuntimeState,
} from "@/generated/soulfire/bot_pb";

/** Where a bot is on its way to a live Bot view. */
export type PovConnectionStep =
  | "online"
  | "queued"
  | "starting"
  | "joining"
  | "retrying"
  | "failed"
  | "stopping"
  | "stopped";

/** Steps that end on their own, so the user should wait instead of acting. */
export const POV_WAITING_STEPS: ReadonlySet<PovConnectionStep> = new Set([
  "queued",
  "starting",
  "joining",
  "retrying",
  "stopping",
]);

export function getPovConnectionStep(
  bot: Pick<BotInfoResponse, "liveState" | "status" | "connection">,
): PovConnectionStep {
  const runtime = bot.status?.runtimeState;
  if (runtime === BotRuntimeState.STOPPING) return "stopping";
  if (bot.liveState) return "online";
  if (runtime === BotRuntimeState.FAILED) return "failed";
  if (runtime === BotRuntimeState.RETRYING) return "retrying";
  // A connection without player data means the bot is logging in.
  if (bot.connection || runtime === BotRuntimeState.RUNNING) return "joining";
  if (runtime === BotRuntimeState.QUEUED) return "queued";
  if (
    runtime === BotRuntimeState.STARTING ||
    bot.status?.desiredState === BotDesiredState.RUNNING
  )
    return "starting";
  return "stopped";
}

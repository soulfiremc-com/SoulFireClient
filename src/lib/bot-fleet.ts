import {
  BotConnectionPhase,
  BotDesiredState,
  type BotListEntry,
  BotRuntimeState,
} from "@/generated/soulfire/bot_pb";

/**
 * What a bot is doing right now. "Desired" only says what the user asked for,
 * so a bot that should run can still be starting, retrying, or failed.
 */
export type BotDisplayState =
  | "connected"
  | "starting"
  | "retrying"
  | "failed"
  | "stopping"
  | "stopped";

export const BOT_DISPLAY_STATES: readonly BotDisplayState[] = [
  "connected",
  "starting",
  "retrying",
  "failed",
  "stopping",
  "stopped",
];

type StatusFields = Pick<BotListEntry, "isOnline" | "status"> &
  Partial<Pick<BotListEntry, "connectionPhase">>;

export function getBotDisplayState(
  bot: StatusFields | undefined,
): BotDisplayState {
  if (!bot) return "stopped";
  const runtime = bot.status?.runtimeState;
  if (runtime === BotRuntimeState.STOPPING) return "stopping";
  if (bot.isOnline) return "connected";
  if (runtime === BotRuntimeState.FAILED) return "failed";
  if (runtime === BotRuntimeState.RETRYING) return "retrying";
  if (
    runtime === BotRuntimeState.QUEUED ||
    runtime === BotRuntimeState.STARTING ||
    runtime === BotRuntimeState.RUNNING ||
    bot.connectionPhase === BotConnectionPhase.CONNECTING ||
    bot.status?.desiredState === BotDesiredState.RUNNING
  ) {
    return "starting";
  }
  return "stopped";
}

export type BotFleetCounts = Record<BotDisplayState, number> & {
  total: number;
  /** Bots the user asked to run, whether or not they are connected. */
  desired: number;
};

export function countBotFleet(
  bots: readonly (StatusFields | undefined)[],
): BotFleetCounts {
  const counts: BotFleetCounts = {
    connected: 0,
    starting: 0,
    retrying: 0,
    failed: 0,
    stopping: 0,
    stopped: 0,
    total: bots.length,
    desired: 0,
  };
  for (const bot of bots) {
    counts[getBotDisplayState(bot)] += 1;
    if (bot?.status?.desiredState === BotDesiredState.RUNNING) {
      counts.desired += 1;
    }
  }
  return counts;
}

export type BotFailureKind =
  | "unreachable"
  | "onlineAuth"
  | "account"
  | "blocked"
  | "throttled"
  | "version"
  | "proxy"
  | "other";

/**
 * The server reports the plain Minecraft disconnect text or a short exception
 * message. Earlier patterns win, so specific causes come before broad words
 * such as "account" or "version" that can also appear in other messages.
 */
const FAILURE_PATTERNS: readonly (readonly [BotFailureKind, RegExp])[] = [
  ["proxy", /proxy|socks[45]?\b/i],
  // SoulFire's own message when an offline or Bedrock account meets a server
  // in online mode, and login plugins that reserve premium names.
  [
    "onlineAuth",
    /online authentication|online.?mode|premium|use a microsoft (java )?account/i,
  ],
  ["blocked", /\bbanned\b|white-?listed|kicked by an operator/i],
  [
    "account",
    /invalid session|not authenticated|authenticat|failed to verify username|session server|logged in from another location|name is already taken|token|account/i,
  ],
  [
    "version",
    /outdated (client|server)|incompatible client|protocol|unsupported version|version/i,
  ],
  [
    "throttled",
    /throttl|too many|too fast|rate.?limit|please wait|wait before|server is full/i,
  ],
  [
    "unreachable",
    /connection refused|timed? ?out|no route|unknown host|unresolved|name or service|connection reset|unreachable|failed to connect/i,
  ],
];

export function classifyBotFailure(message: string): BotFailureKind {
  return (
    FAILURE_PATTERNS.find(([, pattern]) => pattern.test(message))?.[0] ??
    "other"
  );
}

export type BotFailureGroup = {
  id: string;
  kind: BotFailureKind;
  message: string;
  /** "retrying" groups recover by themselves, "failed" groups need action. */
  severity: "failed" | "retrying";
  botIds: string[];
  botNames: string[];
};

/** Hides values that differ per bot, so the same cause forms one group. */
function normalizeFailure(message: string): string {
  return message
    .trim()
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, "#")
    .replace(/\d+/g, "#")
    .toLowerCase();
}

/**
 * Groups failed and retrying bots by their reported error, with failures first
 * and larger groups before smaller ones. A bot without a server-provided
 * error still appears, so it is never hidden from the user.
 */
export function groupBotFailures(
  bots: readonly BotListEntry[],
): BotFailureGroup[] {
  const groups = new Map<string, BotFailureGroup>();
  for (const bot of bots) {
    const state = getBotDisplayState(bot);
    if (state !== "failed" && state !== "retrying") continue;
    const message = bot.status?.lastError?.trim() ?? "";
    const key = `${state}:${normalizeFailure(message)}`;
    const group = groups.get(key) ?? {
      id: key,
      kind: message ? classifyBotFailure(message) : "other",
      message,
      severity: state,
      botIds: [],
      botNames: [],
    };
    group.botIds.push(bot.profileId);
    group.botNames.push(bot.accountName ?? bot.profileId);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.severity === "failed") - Number(a.severity === "failed") ||
      b.botIds.length - a.botIds.length,
  );
}

/** Picks the stopped bots to start. Bots that should already run stay as is. */
export function selectBotsToStart(
  bots: readonly BotListEntry[],
  count: number | undefined,
  shuffle: boolean,
  random: () => number = Math.random,
): string[] {
  const candidates = bots
    .filter((bot) => bot.status?.desiredState !== BotDesiredState.RUNNING)
    .map((bot) => bot.profileId);
  if (shuffle) {
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [candidates[index], candidates[other]] = [
        candidates[other] as string,
        candidates[index] as string,
      ];
    }
  }
  return count === undefined
    ? candidates
    : candidates.slice(0, Math.max(0, Math.floor(count)));
}

/**
 * Reads a typed bot count. Returns null unless it is a whole number from 1 to
 * `max`. Pass no `max` when the limit is not known yet.
 */
export function parseBotStartCount(value: string, max?: number): number | null {
  if (!/^\s*\d+\s*$/.test(value)) return null;
  const count = Number(value);
  if (count < 1 || (max !== undefined && count > max)) return null;
  return count;
}

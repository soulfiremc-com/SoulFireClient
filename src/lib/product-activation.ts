import { matchQuery, type QueryClient } from "@tanstack/react-query";
import {
  BotConnectionPhase,
  type BotListEntry,
  type BotListResponse,
} from "@/generated/soulfire/bot_pb";
import {
  type BotFailureKind,
  classifyBotFailure,
  getBotDisplayState,
} from "./bot-fleet.ts";

type ObservedBot = Pick<
  BotListEntry,
  "isOnline" | "connectionPhase" | "status"
>;

type MeasurementProperties = {
  client_surface: "desktop" | "web";
  measurement_version: number;
  activation?: "first_bot_spawned";
  failure_kind?: BotFailureKind;
  bot_state?: "failed" | "retrying";
  $set_once?: {
    product_first_session_at?: string;
    product_activated_at?: string;
  };
};

function isSpawned(bot: ObservedBot) {
  return bot.isOnline && bot.connectionPhase === BotConnectionPhase.SPAWNED;
}

export function createProductActivationTracker({
  capture,
  surface,
  storage,
  now = () => new Date(),
}: {
  capture: (
    event:
      | "product_session_started"
      | "product_activated"
      | "first_bot_connect_failed",
    properties: MeasurementProperties,
  ) => boolean;
  surface: "desktop" | "web";
  storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  now?: () => Date;
}) {
  const sessions = new Set<string>();
  const activated = new Set<string>();
  const failed = new Set<string>();
  const properties = { client_surface: surface, measurement_version: 1 };

  function start(userId: string) {
    if (!userId) return false;
    if (sessions.has(userId)) return true;
    if (
      !capture("product_session_started", {
        ...properties,
        $set_once: { product_first_session_at: now().toISOString() },
      })
    )
      return false;
    sessions.add(userId);
    return true;
  }

  function readFlag(key: string) {
    try {
      return storage?.getItem(key) === "1";
    } catch {
      // Storage restrictions must not prevent measuring this client session.
      return false;
    }
  }

  function writeFlag(key: string) {
    try {
      storage?.setItem(key, "1");
    } catch {
      // In-memory deduplication still applies for this session.
    }
  }

  /**
   * Reports the first failed connection of a user who has no spawned bot yet.
   * A failing bot next to a spawned one does not count, since the user got in.
   * Only the failure kind leaves the client. The raw message can hold server
   * addresses and account names, so it is never sent.
   */
  function observeFailure(userId: string, bots: readonly ObservedBot[]) {
    if (
      !userId ||
      activated.has(userId) ||
      failed.has(userId) ||
      bots.some((bot) => isSpawned(bot))
    ) {
      return false;
    }
    let failure:
      | { kind: BotFailureKind; state: "failed" | "retrying" }
      | undefined;
    for (const bot of bots) {
      const state = getBotDisplayState(bot);
      if (state !== "failed" && state !== "retrying") continue;
      const message = bot.status?.lastError?.trim();
      // A retry without a reported error has no cause to split the funnel by.
      if (state === "retrying" && !message) continue;
      failure = {
        kind: message ? classifyBotFailure(message) : "other",
        state,
      };
      if (state === "failed") break;
    }
    if (!failure) return false;
    if (
      readFlag(`soulfire-product-activated-v1:${userId}`) ||
      readFlag(`soulfire-first-bot-failed-v1:${userId}`)
    ) {
      failed.add(userId);
      return false;
    }
    if (!start(userId)) return false;
    if (
      !capture("first_bot_connect_failed", {
        ...properties,
        failure_kind: failure.kind,
        bot_state: failure.state,
      })
    ) {
      return false;
    }
    failed.add(userId);
    writeFlag(`soulfire-first-bot-failed-v1:${userId}`);
    return true;
  }

  function observeActivation(userId: string, bots: readonly ObservedBot[]) {
    if (
      !userId ||
      activated.has(userId) ||
      !bots.some((bot) => isSpawned(bot))
    ) {
      return false;
    }

    const key = `soulfire-product-activated-v1:${userId}`;
    if (readFlag(key)) {
      activated.add(userId);
      return false;
    }

    if (!start(userId)) return false;
    if (
      !capture("product_activated", {
        ...properties,
        activation: "first_bot_spawned",
        $set_once: { product_activated_at: now().toISOString() },
      })
    ) {
      return false;
    }

    activated.add(userId);
    writeFlag(key);
    return true;
  }

  /** Returns whether this observation activated the user. */
  function observe(userId: string, bots: readonly ObservedBot[]) {
    const didActivate = observeActivation(userId, bots);
    observeFailure(userId, bots);
    return didActivate;
  }

  return { start, observe };
}

export function watchProductActivation(
  queryClient: QueryClient,
  userId: string,
  tracker: ReturnType<typeof createProductActivationTracker>,
) {
  // Wait for a fresh result so cached demo or previous-user fleets cannot activate this user.
  return queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === "updated" &&
      event.action.type === "success" &&
      matchQuery({ queryKey: ["bot-status"] }, event.query)
    ) {
      tracker.observe(
        userId,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the bot-status query always stores a BotListResponse
        (event.query.state.data as BotListResponse | undefined)?.bots ?? [],
      );
    }
  });
}

import type { QueryClient } from "@tanstack/react-query";
import {
  BotConnectionPhase,
  type BotListEntry,
  type BotListResponse,
} from "@/generated/soulfire/bot_pb";

type MeasurementProperties = {
  client_surface: "desktop" | "web";
  measurement_version: number;
  activation?: "first_bot_spawned";
  $set_once?: {
    product_first_session_at?: string;
    product_activated_at?: string;
  };
};

export function createProductActivationTracker({
  capture,
  surface,
  storage,
  now = () => new Date(),
}: {
  capture: (
    event: "product_session_started" | "product_activated",
    properties: MeasurementProperties,
  ) => boolean;
  surface: "desktop" | "web";
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => Date;
}) {
  const sessions = new Set<string>();
  const activated = new Set<string>();
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

  function observe(
    userId: string,
    bots: readonly Pick<BotListEntry, "isOnline" | "connectionPhase">[],
  ) {
    if (
      !userId ||
      activated.has(userId) ||
      !bots.some(
        (bot) =>
          bot.isOnline && bot.connectionPhase === BotConnectionPhase.SPAWNED,
      )
    ) {
      return false;
    }

    const key = `soulfire-product-activated-v1:${userId}`;
    try {
      if (storage?.getItem(key) === "1") {
        activated.add(userId);
        return false;
      }
    } catch {
      // Storage restrictions must not prevent measuring this client session.
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
    try {
      storage?.setItem(key, "1");
    } catch {
      // In-memory deduplication still applies for this session.
    }
    return true;
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
      event.query.queryKey[0] === "bot-status"
    ) {
      tracker.observe(
        userId,
        (event.query.state.data as BotListResponse | undefined)?.bots ?? [],
      );
    }
  });
}

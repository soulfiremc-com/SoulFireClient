import {
  Code,
  ConnectError,
  createClient,
  type Transport,
} from "@connectrpc/connect";
import {
  type BotListResponse,
  BotService,
} from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import type { QueryClient } from "@tanstack/react-query";
import { reconcileBotStatuses } from "./bot-status-cache.ts";

export function watchBotStatuses(
  transport: Transport,
  queryClient: QueryClient,
  instanceId: string,
) {
  const controller = new AbortController();
  const client = createClient(BotService, transport);
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1_000;

  const refresh = () => {
    if (refreshTimer !== undefined) return;
    // Coalesce fleet events without postponing refreshes under sustained load.
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      for (const queryKey of [
        ["bot-status", instanceId],
        ["bot-info", instanceId],
        ["instance-info", instanceId],
        ["instance-list"],
      ]) {
        void queryClient.invalidateQueries(
          { queryKey },
          { cancelRefetch: false },
        );
      }
    }, 250);
  };

  const watch = async () => {
    try {
      for await (const event of client.watchBotStatuses(
        { instanceId },
        { signal: controller.signal },
      )) {
        if (controller.signal.aborted) return;
        retryDelay = 1_000;
        const value = event.event;
        if (value.case === undefined) continue;
        queryClient.setQueryData<BotListResponse>(
          ["bot-status", instanceId],
          (current) =>
            reconcileBotStatuses(
              current,
              value.case === "snapshot"
                ? value.value.bots
                : value.case === "update"
                  ? [value.value]
                  : [],
              value.case === "snapshot",
              value.case === "removedBotId" ? value.value : undefined,
            ),
        );
        refresh();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Bot status stream ended", error);
      const code = ConnectError.from(error).code;
      if (
        [
          Code.PermissionDenied,
          Code.Unauthenticated,
          Code.Unimplemented,
        ].includes(code)
      )
        return;
    }
    if (controller.signal.aborted) return;
    refresh();
    retryTimer = setTimeout(() => void watch(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };
  void watch();

  return () => {
    controller.abort();
    clearTimeout(refreshTimer);
    clearTimeout(retryTimer);
  };
}

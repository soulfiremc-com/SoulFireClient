import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import type { Transport } from "@connectrpc/connect";
import { queryOptions } from "@tanstack/react-query";
import { demoBotList } from "@/demo-data.ts";
import { type BotListResponse, BotService } from "@/generated/soulfire/bot_pb";
import { createTransport } from "@/lib/web-rpc.ts";
import { shareBotListData } from "./bot-status-cache.ts";

/// Shared query options for the live bot status list of an instance.
/// Polled every 3 seconds and keyed so the overview and bots pages share
/// a single cache entry.
export function botStatusQueryOptions(instanceId: string) {
  return queryOptions({
    queryKey: ["bot-status", instanceId],
    structuralSharing: shareBotListData,
    queryFn: async ({ signal }): Promise<BotListResponse> => {
      const transport = createTransport();
      if (transport === null) {
        return demoBotList;
      }

      const botService = createRpcClient(BotService, transport);
      return Effect.runPromise(
        botService.getBotList({ instanceId }, { signal }),
      );
    },
    refetchInterval: 3_000,
  });
}

/// Reads the same cache entry through a supplied transport without polling.
/// The command menu uses this while it is open.
export function botStatusRpcQueryOptions(
  transport: Transport | null,
  instanceId: string,
) {
  return queryOptions({
    queryKey: ["bot-status", instanceId],
    structuralSharing: shareBotListData,
    queryFn: async ({ signal }): Promise<BotListResponse> =>
      transport === null
        ? demoBotList
        : Effect.runPromise(
            createRpcClient(BotService, transport).getBotList(
              { instanceId },
              { signal },
            ),
          ),
  });
}

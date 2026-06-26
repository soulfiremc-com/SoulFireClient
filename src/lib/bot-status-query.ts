import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { queryOptions } from "@tanstack/react-query";
import {
  type BotListResponse,
  BotListResponseSchema,
  BotService,
} from "@/generated/soulfire/bot_pb.ts";
import { createTransport } from "@/lib/web-rpc.ts";

/// Shared query options for the live bot status list of an instance.
/// Polled every 3 seconds and keyed so the overview and bots pages share
/// a single cache entry.
export function botStatusQueryOptions(instanceId: string) {
  return queryOptions({
    queryKey: ["bot-status", instanceId],
    queryFn: async ({ signal }): Promise<BotListResponse> => {
      const transport = createTransport();
      if (transport === null) {
        return create(BotListResponseSchema, { bots: [] });
      }

      const botService = createClient(BotService, transport);
      return botService.getBotList({ instanceId }, { signal });
    },
    refetchInterval: 3_000,
  });
}

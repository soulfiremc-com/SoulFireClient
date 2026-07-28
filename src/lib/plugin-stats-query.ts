import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import {
  type GetInstancePluginStatsResponse,
  GetInstancePluginStatsResponseSchema,
  PluginStatsService,
} from "@soulfiremc/sdk/generated/soulfire/plugin_stats_pb";
import { queryOptions } from "@tanstack/react-query";
import { createTransport } from "@/lib/web-rpc.ts";

/// Shared query options for an instance's per-plugin runtime statistics.
/// Polled every 3 seconds, keyed per instance so consumers share one cache
/// entry. Returns an empty result in demo mode (no transport).
export function pluginStatsQueryOptions(instanceId: string) {
  return queryOptions({
    queryKey: ["plugin-stats", instanceId],
    queryFn: async ({ signal }): Promise<GetInstancePluginStatsResponse> => {
      const transport = createTransport();
      if (transport === null) {
        return create(GetInstancePluginStatsResponseSchema, { stats: [] });
      }

      const service = createClient(PluginStatsService, transport);
      return service.getInstancePluginStats({ instanceId }, { signal });
    },
    refetchInterval: 3_000,
  });
}

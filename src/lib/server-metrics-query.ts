import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { queryOptions } from "@tanstack/react-query";
import {
  type GetServerMetricsResponse,
  GetServerMetricsResponseSchema,
  MetricsService,
} from "@/generated/soulfire/metrics_pb";
import { mergeSnapshots } from "@/lib/metrics-utils";
import { queryKeys } from "@/lib/query-keys.ts";

export function serverMetricsQueryOptions(transport: Transport | null) {
  // oxlint-disable-next-line tanstack-query/exhaustive-deps -- The query cache is scoped to the authentication session and cleared when its transport credentials change.
  return queryOptions({
    queryKey: queryKeys.serverMetrics(),
    queryFn: async ({
      client: queryClient,
      queryKey,
      signal,
    }): Promise<GetServerMetricsResponse> => {
      if (!transport) {
        return create(GetServerMetricsResponseSchema, {
          snapshots: [],
        });
      }

      const previous =
        queryClient.getQueryData<GetServerMetricsResponse>(queryKey);
      const since = previous?.snapshots.at(-1)?.timestamp;

      const client = createRpcClient(MetricsService, transport);
      const result = await Effect.runPromise(
        client.getServerMetrics(since ? { since } : {}, {
          signal,
        }),
      );
      const response = result;

      if (!previous || !since) {
        return response;
      }

      return create(GetServerMetricsResponseSchema, {
        snapshots: mergeSnapshots(previous.snapshots, response.snapshots),
      });
    },
    refetchInterval: 3000,
  });
}

import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import {
  type GetServerMetricsResponse,
  GetServerMetricsResponseSchema,
  MetricsService,
} from "@/generated/soulfire/metrics_pb";
import { mergeSnapshots } from "@/lib/metrics-utils";

export function serverMetricsQueryOptions(
  transport: Transport | null,
  queryClient: QueryClient,
) {
  const queryKey = ["server-metrics"] as const;

  return queryOptions({
    queryKey,
    queryFn: async ({ signal }): Promise<GetServerMetricsResponse> => {
      if (!transport) {
        return create(GetServerMetricsResponseSchema, {
          snapshots: [],
        });
      }

      const previous =
        queryClient.getQueryData<GetServerMetricsResponse>(queryKey);
      const since =
        previous && previous.snapshots.length > 0
          ? previous.snapshots[previous.snapshots.length - 1].timestamp
          : undefined;

      const client = createRpcClient(MetricsService, transport);
      const result = await Effect.runPromise(
        client.getServerMetrics(since ? { since } : {}, {
          signal: signal,
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
    refetchInterval: 3_000,
  });
}

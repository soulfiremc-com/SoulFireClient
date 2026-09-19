import { create } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import {
  type GetInstanceMetricsResponse,
  GetInstanceMetricsResponseSchema,
  MetricsDistributionsSchema,
  MetricsService,
} from "@/generated/soulfire/metrics_pb";
import { mergeSnapshots } from "@/lib/metrics-utils";

export function instanceMetricsQueryOptions(
  transport: Transport | null,
  instanceId: string,
  queryClient: QueryClient,
) {
  const queryKey = ["instance-metrics", instanceId] as const;

  return queryOptions({
    queryKey,
    queryFn: async ({ signal }): Promise<GetInstanceMetricsResponse> => {
      if (!transport) {
        return create(GetInstanceMetricsResponseSchema, {
          snapshots: [],
          distributions: create(MetricsDistributionsSchema, {
            healthHistogram: [],
            foodHistogram: [],
            dimensionCounts: {},
            gameModeCounts: {},
            botPositions: [],
          }),
        });
      }

      const previous =
        queryClient.getQueryData<GetInstanceMetricsResponse>(queryKey);
      const since =
        previous && previous.snapshots.length > 0
          ? previous.snapshots[previous.snapshots.length - 1].timestamp
          : undefined;

      const client = createClient(MetricsService, transport);
      const result = await client.getInstanceMetrics(
        since
          ? {
              instanceId,
              since,
            }
          : { instanceId },
        { signal: signal },
      );
      const response = result;

      if (!previous || !since) {
        return response;
      }

      return create(GetInstanceMetricsResponseSchema, {
        snapshots: mergeSnapshots(previous.snapshots, response.snapshots),
        distributions: response.distributions ?? previous.distributions,
      });
    },
    refetchInterval: 3_000,
  });
}

import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { queryOptions } from "@tanstack/react-query";
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
) {
  // oxlint-disable-next-line tanstack-query/exhaustive-deps -- The query cache is scoped to the authentication session and cleared when its transport credentials change.
  return queryOptions({
    queryKey: ["instance-metrics", instanceId] as const,
    queryFn: async ({
      client: queryClient,
      queryKey,
      signal,
    }): Promise<GetInstanceMetricsResponse> => {
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
      const since = previous?.snapshots.at(-1)?.timestamp;

      const client = createRpcClient(MetricsService, transport);
      const result = await Effect.runPromise(
        client.getInstanceMetrics(
          since
            ? {
                instanceId,
                since,
              }
            : { instanceId },
          { signal },
        ),
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
    refetchInterval: 3000,
  });
}

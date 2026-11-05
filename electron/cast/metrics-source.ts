import {
  createClient,
  ConnectError,
  Code,
  type Transport,
} from "@connectrpc/connect";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { QueryClient } from "@tanstack/query-core";
import {
  mergeSnapshots,
  type CastSource,
  type MetricsSnapshot,
  type MetricsDistributions,
} from "@soulfiremc/cast-protocol";
import { Context, Effect, Layer, type Scope } from "effect";
import { InstanceService } from "../../src/generated/soulfire/instance_pb";
import { MetricsService } from "../../src/generated/soulfire/metrics_pb";
import { castError, type CastError } from "./errors";

export interface MetricsFrame {
  readonly snapshots: readonly MetricsSnapshot[];
  readonly distributions: MetricsDistributions;
  readonly instanceInfo: {
    readonly name: string;
    readonly onlineBots: number;
    readonly desiredBots: number;
  };
}
export class MetricsSource extends Context.Service<
  MetricsSource,
  {
    readonly open: (source: CastSource) => Effect.Effect<
      {
        readonly read: Effect.Effect<MetricsFrame, CastError>;
      },
      never,
      Scope.Scope
    >;
  }
>()("soulfire/MetricsSource") {}

export const makeMetricsSource = (
  transportFor: (source: CastSource) => Transport,
) =>
  Layer.succeed(MetricsSource, {
    open: (source) =>
      Effect.gen(function* () {
        const cache = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new QueryClient({
                defaultOptions: { queries: { retry: false, gcTime: Infinity } },
              }),
          ),
          (client) =>
            Effect.promise(async () => {
              await client.cancelQueries();
              client.clear();
            }),
        );
        const transport = transportFor(source);
        const metrics = createClient(MetricsService, transport);
        const instances = createClient(InstanceService, transport);
        let snapshots: readonly MetricsSnapshot[] = [];
        let since: Timestamp | undefined;
        return {
          read: Effect.tryPromise({
            try: async (signal) => {
              const [response, info] = await Promise.all([
                cache.fetchQuery({
                  queryKey: ["metrics"],
                  queryFn: ({ signal: querySignal }) =>
                    metrics.getInstanceMetrics(
                      {
                        instanceId: source.instanceId,
                        since,
                      },
                      { signal: AbortSignal.any([signal, querySignal]) },
                    ),
                }),
                cache.fetchQuery({
                  queryKey: ["info"],
                  staleTime: 10_000,
                  queryFn: ({ signal: querySignal }) =>
                    instances.getInstanceInfo(
                      { id: source.instanceId },
                      { signal: AbortSignal.any([signal, querySignal]) },
                    ),
                }),
              ]);
              if (info.result.case !== "info")
                throw new Error("The project is unavailable.");
              snapshots = mergeSnapshots(
                snapshots,
                response.snapshots.flatMap((snapshot) =>
                  snapshot.timestamp
                    ? [
                        {
                          ...snapshot,
                          timestamp:
                            Number(snapshot.timestamp.seconds) * 1000 +
                            snapshot.timestamp.nanos / 1_000_000,
                        },
                      ]
                    : [],
                ),
              );
              for (const snapshot of response.snapshots) {
                const timestamp = snapshot.timestamp;
                if (
                  timestamp &&
                  (!since ||
                    timestamp.seconds > since.seconds ||
                    (timestamp.seconds === since.seconds &&
                      timestamp.nanos > since.nanos))
                )
                  since = timestamp;
              }
              return {
                snapshots,
                distributions: {
                  healthHistogram:
                    response.distributions?.healthHistogram ?? [],
                  foodHistogram: response.distributions?.foodHistogram ?? [],
                  dimensionCounts:
                    response.distributions?.dimensionCounts ?? {},
                  gameModeCounts: response.distributions?.gameModeCounts ?? {},
                  botPositions: (response.distributions?.botPositions ?? [])
                    .slice(0, 100)
                    .map(({ x, z, dimension }) => ({ x, z, dimension })),
                },
                instanceInfo: {
                  name: info.result.value.friendlyName,
                  onlineBots: info.result.value.botSummary?.onlineBots ?? 0,
                  desiredBots: info.result.value.botSummary?.desiredBots ?? 0,
                },
              };
            },
            catch: (error) => {
              const code = ConnectError.from(error).code;
              return castError(
                "Could not fetch Cast metrics from the Soulfire server.",
                ![
                  Code.Unauthenticated,
                  Code.PermissionDenied,
                  Code.NotFound,
                  Code.InvalidArgument,
                ].includes(code),
              );
            },
          }).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError((error) =>
              error._tag === "CastError"
                ? error
                : castError("The metrics request timed out."),
            ),
          ),
        };
      }),
  });

export const MetricsSourceLive = makeMetricsSource((source) =>
  createGrpcWebTransport({
    baseUrl: source.address,
    interceptors: [
      (next) => (request) => {
        request.header.set("Authorization", `Bearer ${source.token}`);
        return next(request);
      },
    ],
  }),
);

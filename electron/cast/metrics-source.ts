import { createRpcClient } from "../../src/lib/rpc";
import { ConnectError, Code, type Transport } from "@connectrpc/connect";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import {
  mergeSnapshots,
  type CastSource,
  type MetricsSnapshot,
  type MetricsDistributions,
} from "@soulfiremc/cast-protocol";
import { Clock, Context, Effect, Layer, type Scope } from "effect";
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
>()("soulfire/electron/cast/metrics-source/MetricsSource") {}

// Project names and bot counts change rarely, so the feed reuses them for a
// short time instead of asking for them on every metrics poll.
const INFO_MAX_AGE_MS = 10_000;

export const makeMetricsSource = (
  transportFor: (source: CastSource) => Transport,
) =>
  Layer.succeed(MetricsSource, {
    open: (source) =>
      Effect.sync(() => {
        const transport = transportFor(source);
        const metrics = createRpcClient(MetricsService, transport);
        const instances = createRpcClient(InstanceService, transport);
        let snapshots: readonly MetricsSnapshot[] = [];
        let since: Timestamp | undefined;
        let info:
          | { value: MetricsFrame["instanceInfo"]; fetchedAt: number }
          | undefined;
        const readInfo = Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          if (info && now - info.fetchedAt < INFO_MAX_AGE_MS) return info.value;
          const response = yield* instances.getInstanceInfo({
            id: source.instanceId,
          });
          if (response.result.case !== "info")
            return yield* castError("metricsFailed");
          const value = {
            name: response.result.value.friendlyName,
            onlineBots: response.result.value.botSummary?.onlineBots ?? 0,
            desiredBots: response.result.value.botSummary?.desiredBots ?? 0,
          };
          info = { value, fetchedAt: now };
          return value;
        });
        const read = Effect.gen(function* () {
          const [response, instanceInfo] = yield* Effect.all(
            [
              metrics.getInstanceMetrics({
                instanceId: source.instanceId,
                since,
              }),
              readInfo,
            ],
            { concurrency: 2 },
          );
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
              healthHistogram: response.distributions?.healthHistogram ?? [],
              foodHistogram: response.distributions?.foodHistogram ?? [],
              dimensionCounts: response.distributions?.dimensionCounts ?? {},
              gameModeCounts: response.distributions?.gameModeCounts ?? {},
              botPositions: (response.distributions?.botPositions ?? [])
                .slice(0, 100)
                .map(({ x, z, dimension }) => ({ x, z, dimension })),
            },
            instanceInfo,
          };
        });
        return {
          read: read.pipe(
            Effect.mapError((error) =>
              error instanceof ConnectError
                ? castError(
                    "metricsFailed",
                    ![
                      Code.Unauthenticated,
                      Code.PermissionDenied,
                      Code.NotFound,
                      Code.InvalidArgument,
                    ].includes(error.code),
                  )
                : error,
            ),
            Effect.timeoutOrElse({
              duration: "10 seconds",
              orElse: () => Effect.fail(castError("metricsTimeout")),
            }),
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

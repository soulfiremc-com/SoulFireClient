import type { GetInstanceMetricsResponse } from "@soulfiremc/sdk/generated/soulfire/metrics_pb";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type {
  CastMetricsSnapshot,
  CastMetricsUpdateMessage,
} from "@/lib/cast-protocol";
import { desktop, isDesktopApp } from "@/lib/desktop";
import type { InstanceInfoQueryData } from "@/lib/types";

const BROADCAST_INTERVAL_MS = 5_000;
const MAX_POSITIONS = 50;

export function useCastBroadcast(
  metricsQueryKey: QueryKey,
  instanceInfoQueryKey: QueryKey,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDesktopApp()) return;

    const interval = setInterval(() => {
      const metricsData =
        queryClient.getQueryData<GetInstanceMetricsResponse>(metricsQueryKey);
      const instanceData =
        queryClient.getQueryData<InstanceInfoQueryData>(instanceInfoQueryKey);

      if (!metricsData || !instanceData) return;

      const latestSnapshot =
        metricsData.snapshots.length > 0
          ? metricsData.snapshots[metricsData.snapshots.length - 1]
          : null;

      if (!latestSnapshot) return;

      const snapshot: CastMetricsSnapshot = {
        timestamp: latestSnapshot.timestamp
          ? new Date(
              Number(latestSnapshot.timestamp.seconds) * 1000 +
                latestSnapshot.timestamp.nanos / 1_000_000,
            ).toISOString()
          : new Date().toISOString(),
        botsOnline: latestSnapshot.botsOnline,
        botsTotal: latestSnapshot.botsTotal,
        packetsSentPerSecond: latestSnapshot.packetsSentPerSecond,
        packetsReceivedPerSecond: latestSnapshot.packetsReceivedPerSecond,
        bytesSentPerSecond: latestSnapshot.bytesSentPerSecond,
        bytesReceivedPerSecond: latestSnapshot.bytesReceivedPerSecond,
        avgTickDurationMs: latestSnapshot.avgTickDurationMs,
        maxTickDurationMs: latestSnapshot.maxTickDurationMs,
        avgHealth: latestSnapshot.avgHealth,
        avgFoodLevel: latestSnapshot.avgFoodLevel,
        totalLoadedChunks: latestSnapshot.totalLoadedChunks,
        totalTrackedEntities: latestSnapshot.totalTrackedEntities,
        connections: latestSnapshot.connections,
        disconnections: latestSnapshot.disconnections,
      };

      const distributions = metricsData.distributions;
      const positions = (distributions?.botPositions ?? []).slice(
        0,
        MAX_POSITIONS,
      );

      const message: CastMetricsUpdateMessage = {
        type: "METRICS_UPDATE",
        snapshot,
        distributions: {
          healthHistogram: distributions?.healthHistogram ?? [],
          foodHistogram: distributions?.foodHistogram ?? [],
          dimensionCounts: distributions?.dimensionCounts ?? {},
          gameModeCounts: distributions?.gameModeCounts ?? {},
          botPositions: positions.map((p) => ({
            x: p.x,
            z: p.z,
            dimension: p.dimension,
          })),
        },
        instanceInfo: {
          friendlyName: instanceData.friendlyName,
          state: `${instanceData.botSummary?.onlineBots ?? 0} online, ${instanceData.botSummary?.desiredBots ?? 0} desired`,
        },
      };

      void desktop.cast.broadcast(message);
    }, BROADCAST_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      void desktop.cast.broadcast({ type: "METRICS_STOP" });
    };
  }, [queryClient, metricsQueryKey, instanceInfoQueryKey]);
}

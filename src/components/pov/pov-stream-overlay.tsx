import { useEffect, useState } from "react";
import type { PovStreamMetrics } from "@/lib/pov-stream-metrics";

export function PovStreamOverlay({ metrics }: { metrics: PovStreamMetrics }) {
  const [stats, setStats] = useState<ReturnType<
    PovStreamMetrics["sample"]
  > | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setStats(metrics.sample()), 1000);
    return () => clearInterval(timer);
  }, [metrics]);

  return (
    <div
      className="pointer-events-none absolute top-2 right-2 z-10 rounded bg-black/80 px-2 py-1.5 font-mono text-2xs leading-4 text-white tabular-nums"
      aria-hidden="true"
    >
      <div>{stats?.format ?? "POV stream metrics"}</div>
      {stats && (
        <>
          <div>
            FPS {stats.drawnFps.toFixed(1)} drawn /{" "}
            {stats.receivedFps.toFixed(1)} received
          </div>
          <div>
            Video {stats.mbps.toFixed(2)} Mbit/s · {stats.frameKiB.toFixed(1)}{" "}
            KiB/frame
          </div>
          <div>
            Target {stats.targetMbps.toFixed(2)} Mbit/s · Receive→draw{" "}
            {stats.receiveToDrawMs?.toFixed(1) ?? "–"} ms
          </div>
          <div>
            Decoder {stats.queued ?? 0} queued / {stats.pending ?? 0} pending
            {stats.waitingForKey ? " · awaiting keyframe" : ""}
          </div>
          <div>
            Keyframes {stats.keyframes.toFixed(1)}/s · Last frame{" "}
            {stats.frameAgeMs?.toFixed(0) ?? "–"} ms ago
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFixed as fixed, formatNumber } from "@/lib/format";
import type { PovStreamMetrics } from "@/lib/pov-stream-metrics";

export function PovStreamOverlay({ metrics }: { metrics: PovStreamMetrics }) {
  const { t } = useTranslation("instance");
  const [stats, setStats] = useState<ReturnType<
    PovStreamMetrics["sample"]
  > | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setStats(metrics.sample());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [metrics]);
  const unknown = t("bots.pov.streamMetrics.unknown");

  return (
    <div
      className="pointer-events-none absolute top-2 right-2 z-10 rounded-sm bg-black/80 px-2 py-1.5 font-mono text-2xs/4 text-white tabular-nums"
      aria-hidden="true"
    >
      <div>
        {stats
          ? (stats.format ?? t("bots.pov.streamMetrics.waitingForVideo"))
          : t("bots.pov.streamMetrics.title")}
      </div>
      {stats && (
        <>
          <div>
            {t("bots.pov.streamMetrics.fps", {
              drawn: fixed(stats.drawnFps, 1),
              received: fixed(stats.receivedFps, 1),
            })}
          </div>
          <div>
            {t("bots.pov.streamMetrics.video", {
              mbps: fixed(stats.mbps, 2),
              frameKiB: fixed(stats.frameKiB, 1),
            })}
          </div>
          <div>
            {t("bots.pov.streamMetrics.target", {
              mbps: fixed(stats.targetMbps, 2),
              ms:
                stats.receiveToDrawMs === null
                  ? unknown
                  : fixed(stats.receiveToDrawMs, 1),
            })}
          </div>
          <div>
            {t(
              stats.waitingForKey
                ? "bots.pov.streamMetrics.decoderWaitingForKey"
                : "bots.pov.streamMetrics.decoder",
              {
                queued: formatNumber(stats.queued ?? 0),
                pending: formatNumber(stats.pending ?? 0),
              },
            )}
          </div>
          <div>
            {t("bots.pov.streamMetrics.keyframes", {
              rate: fixed(stats.keyframes, 1),
              age:
                stats.frameAgeMs === null
                  ? unknown
                  : fixed(stats.frameAgeMs, 0),
            })}
          </div>
        </>
      )}
    </div>
  );
}

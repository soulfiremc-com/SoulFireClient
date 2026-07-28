import type { Timestamp } from "@bufbuild/protobuf/wkt";

const INTERVAL_SECONDS = 3;
const MAX_SNAPSHOTS = 600; // 30 minutes at 3-second intervals
const MAX_CHART_POINTS = 120;

const axisTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const tooltipTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface HasTimestamp {
  timestamp?: Timestamp;
}

export interface PaddedSnapshot<T> {
  timestampMs: number;
  timeLabel: string;
  snapshot: T | null;
}

type ChartPoint = {
  timestampMs: number;
  timeLabel: string;
  [key: string]: number | string | null | undefined;
};

export function formatChartAxisTime(timestampMs: number): string {
  return axisTimeFormatter.format(timestampMs);
}

export function formatChartTooltipTime(timestampMs: number): string {
  return tooltipTimeFormatter.format(timestampMs);
}

export function getSnapshotTimestampMs<T extends HasTimestamp>(
  snapshot: T | null | undefined,
): number | null {
  if (!snapshot?.timestamp) {
    return null;
  }

  return (
    Number(snapshot.timestamp.seconds) * 1000 +
    snapshot.timestamp.nanos / 1_000_000
  );
}

/// Pads a sparse snapshot array into a full 30-minute time grid.
/// Returns 600 entries at 3-second intervals; slots without a real
/// snapshot have `snapshot: null` so Recharts can render gaps.
export function padSnapshots<T extends HasTimestamp>(
  snapshots: T[],
): PaddedSnapshot<T>[] {
  const nowMs = Date.now();
  const intervalMs = INTERVAL_SECONDS * 1000;
  const endSlot = Math.round(nowMs / intervalMs) * intervalMs;
  const startSlot = endSlot - (MAX_SNAPSHOTS - 1) * intervalMs;

  const snapshotMap = new Map<number, T>();
  for (const snapshot of snapshots) {
    const timestampMs = getSnapshotTimestampMs(snapshot);
    if (timestampMs === null) {
      continue;
    }

    const slotMs = Math.round(timestampMs / intervalMs) * intervalMs;
    snapshotMap.set(slotMs, snapshot);
  }

  const result: PaddedSnapshot<T>[] = [];
  for (let i = 0; i < MAX_SNAPSHOTS; i++) {
    const slotMs = startSlot + i * intervalMs;
    result.push({
      timestampMs: slotMs,
      timeLabel: formatChartTooltipTime(slotMs),
      snapshot: snapshotMap.get(slotMs) ?? null,
    });
  }

  return result;
}

export function downsampleTimeSeriesData<T extends ChartPoint>(
  data: T[],
  options?: {
    maxPoints?: number;
    mode?: "last" | "sum";
  },
): T[] {
  const maxPoints = options?.maxPoints ?? MAX_CHART_POINTS;
  const mode = options?.mode ?? "last";

  if (data.length <= maxPoints) {
    return data;
  }

  const bucketSize = Math.ceil(data.length / maxPoints);
  const result: T[] = [];

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    const lastPoint = bucket[bucket.length - 1];

    if (mode === "last") {
      result.push(lastPoint);
      continue;
    }

    const aggregatedPoint = {
      ...lastPoint,
    } as Record<string, number | string | null | undefined>;

    for (const key of Object.keys(lastPoint)) {
      if (key === "timestampMs" || key === "timeLabel") {
        continue;
      }

      let sum = 0;
      let hasNumericValue = false;

      for (const point of bucket) {
        const value = point[key];
        if (typeof value === "number") {
          sum += value;
          hasNumericValue = true;
        }
      }

      aggregatedPoint[key] = hasNumericValue ? sum : null;
    }

    result.push(aggregatedPoint as T);
  }

  const latestPoint = data[data.length - 1];
  if (result[result.length - 1]?.timestampMs !== latestPoint.timestampMs) {
    result.push(latestPoint);
  }

  return result;
}

export function mergeSnapshots<T extends HasTimestamp>(
  previous: T[],
  incoming: T[],
): T[] {
  if (previous.length === 0) {
    return incoming.slice(-MAX_SNAPSHOTS);
  }

  if (incoming.length === 0) {
    return previous.slice(-MAX_SNAPSHOTS);
  }

  const deduped = new Map<number, T>();

  for (const snapshot of previous) {
    const timestampMs = getSnapshotTimestampMs(snapshot);
    if (timestampMs !== null) {
      deduped.set(timestampMs, snapshot);
    }
  }

  for (const snapshot of incoming) {
    const timestampMs = getSnapshotTimestampMs(snapshot);
    if (timestampMs !== null) {
      deduped.set(timestampMs, snapshot);
    }
  }

  return Array.from(deduped.entries())
    .sort(([left], [right]) => left - right)
    .slice(-MAX_SNAPSHOTS)
    .map(([, snapshot]) => snapshot);
}

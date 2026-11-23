import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { currentIntlLocale } from "@/lib/intl-locale.ts";

const INTERVAL_SECONDS = 3;
const MAX_SNAPSHOTS = 600; // 30 minutes at 3-second intervals
const MAX_CHART_POINTS = 120;

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

// Cache one formatter per language and style, so charts follow language
// changes without building a formatter for every point.
function timeFormatter(withSeconds: boolean): Intl.DateTimeFormat {
  const locale = currentIntlLocale();
  const cacheKey = `${locale ?? ""}:${withSeconds}`;
  let formatter = timeFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      ...(withSeconds && { second: "2-digit" }),
    });
    timeFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

interface HasTimestamp {
  timestamp?: Timestamp | undefined;
}

export interface PaddedSnapshot<T> {
  timestampMs: number;
  timeLabel: string;
  snapshot: T | null;
}

interface ChartPoint {
  timestampMs: number;
  timeLabel: string;
  [key: string]: number | string | null | undefined;
}

export function formatChartAxisTime(timestampMs: number): string {
  return timeFormatter(false).format(timestampMs);
}

export function formatChartTooltipTime(timestampMs: number): string {
  return timeFormatter(true).format(timestampMs);
}

export function getSnapshotTimestampMs(
  snapshot: HasTimestamp | null | undefined,
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
/// The grid ends at the newest snapshot, so it follows the server's sampling
/// phase and clock. A grid built from the client clock splits evenly spaced
/// snapshots across slot boundaries and drops snapshots from a server ahead
/// of the client.
export function padSnapshots<T extends HasTimestamp>(
  snapshots: T[],
  nowMs = Date.now(),
): PaddedSnapshot<T>[] {
  const intervalMs = INTERVAL_SECONDS * 1000;
  const newestMs = snapshots.reduce<number | null>((newest, snapshot) => {
    const timestampMs = getSnapshotTimestampMs(snapshot);
    return timestampMs !== null && (newest === null || timestampMs > newest)
      ? timestampMs
      : newest;
  }, null);
  const endSlot = newestMs ?? Math.round(nowMs / intervalMs) * intervalMs;
  const startSlot = endSlot - (MAX_SNAPSHOTS - 1) * intervalMs;

  const snapshotMap = new Map<number, T>();
  for (const snapshot of snapshots) {
    const timestampMs = getSnapshotTimestampMs(snapshot);
    if (timestampMs === null) {
      continue;
    }

    const slotMs =
      startSlot +
      Math.round((timestampMs - startSlot) / intervalMs) * intervalMs;
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

function hasChartValue(point: ChartPoint): boolean {
  return Object.entries(point).some(
    ([key, value]) =>
      key !== "timestampMs" && key !== "timeLabel" && typeof value === "number",
  );
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
    const lastPoint = bucket.at(-1);
    if (lastPoint === undefined) {
      continue;
    }

    if (mode === "last") {
      // A gap in the final slot must not hide the rest of the bucket.
      result.push(
        bucket.findLast((point) => hasChartValue(point)) ?? lastPoint,
      );
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

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the aggregated point copies every field of a T and replaces numeric fields with sums
    result.push(aggregatedPoint as T);
  }

  const latestPoint = data.at(-1);
  if (
    latestPoint !== undefined &&
    result.at(-1)?.timestampMs !== latestPoint.timestampMs
  ) {
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
    .toSorted(([left], [right]) => left - right)
    .slice(-MAX_SNAPSHOTS)
    .map(([, snapshot]) => snapshot);
}

import { useCallback, useSyncExternalStore } from "react";
import { subscribeToTicker } from "@/lib/ticker.ts";

/**
 * Recomputes a value on a shared timer and re-renders only when it changes.
 * The value must be a primitive, so equal results compare equal.
 */
export function useChangingData<T extends string | number | boolean | null>(
  produce: () => T,
  intervalMs = 1000,
): T {
  const subscribe = useCallback(
    (onTick: () => void) => subscribeToTicker(intervalMs, onTick),
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, produce, produce);
}

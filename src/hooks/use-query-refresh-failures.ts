import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { hasFailedRefresh } from "@/lib/query-refresh-state";

export function useQueryRefreshFailures() {
  const queryCache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (onChange: () => void) => queryCache.subscribe(onChange),
    [queryCache],
  );
  const getSnapshot = useCallback(
    () => queryCache.getAll().some(hasFailedRefresh),
    [queryCache],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

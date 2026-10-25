import {
  type MutationFilters,
  type QueryClient,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";

export function createMutationScopePendingStore(
  client: QueryClient,
  scopeId: string,
) {
  const filters: MutationFilters = {
    predicate: (mutation) => mutation.options.scope?.id === scopeId,
  };

  return {
    subscribe: (onChange: () => void) =>
      client.getMutationCache().subscribe(onChange),
    // Activity can hide a tab while a mutation settles, so read fresh cache state.
    getSnapshot: () => client.isMutating(filters) > 0,
  };
}

export function useMutationScopePending(scopeId: string) {
  const client = useQueryClient();
  const store = useMemo(
    () => createMutationScopePendingStore(client, scopeId),
    [client, scopeId],
  );
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

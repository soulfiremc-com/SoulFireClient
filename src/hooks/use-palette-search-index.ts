import type { Transport } from "@connectrpc/connect";
import {
  type FetchQueryOptions,
  matchQuery,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from "@tanstack/react-query";
import { Schema } from "effect";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { IndexedProject } from "@/lib/command-palette";
import {
  PALETTE_INDEX_CONCURRENCY,
  PALETTE_INDEX_GC_MS,
  PALETTE_INDEX_STALE_MS,
  type PaletteIndexProgress,
  runBounded,
} from "@/lib/command-palette-index";
import { instanceInfoQueryOptions } from "@/lib/instance-info-query";
import { queryKeys } from "@/lib/query-keys";
import { scriptListQueryOptions } from "@/lib/script-service";
import { serverInfoQueryOptions } from "@/lib/server-info-query";
import type { InstanceInfoQueryData, ServerInfoQueryData } from "@/lib/types";

interface SourceQuery {
  queryKey: QueryKey;
  fetch: (queryClient: QueryClient) => Promise<unknown>;
}
interface Source {
  id: string;
  queries: SourceQuery[];
}
type SourceStatus = "loaded" | "failed";

const INDEXED_KEYS = [
  queryKeys.instanceInfo("")[0],
  queryKeys.scripts("")[0],
  queryKeys.serverInfo()[0],
];
const decodeProjectIds = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);

function sourceQuery<TData, TKey extends QueryKey>(
  options: FetchQueryOptions<TData, Error, TData, TKey>,
): SourceQuery {
  return {
    queryKey: options.queryKey,
    // Fresh cached data resolves without a request.
    fetch: (queryClient) =>
      queryClient.fetchQuery({
        ...options,
        staleTime: PALETTE_INDEX_STALE_MS,
        // Keep results while the menu stays open without page observers.
        gcTime: PALETTE_INDEX_GC_MS,
        retry: false,
      }),
  };
}

/**
 * Loads search metadata for every readable project and, with permission, the
 * server settings. The current API has no search endpoint, so this reads each
 * project once with limited concurrency and shares the regular query cache.
 * Requests start only while `active`, and unfinished ones stop when it ends.
 */
export function usePaletteSearchIndex({
  active,
  projectIds,
  includeServer,
  transport,
}: {
  active: boolean;
  /** Readable projects to index, without the project already in context. */
  projectIds: readonly string[];
  includeServer: boolean;
  transport: Transport | null;
}): {
  projects: IndexedProject[];
  server?: ServerInfoQueryData | undefined;
  progress: PaletteIndexProgress;
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const [attempt, retry] = useReducer((count: number) => count + 1, 0);
  const [revision, refresh] = useReducer((count: number) => count + 1, 0);
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  // A new array with the same IDs must not restart the index.
  const idsKey = JSON.stringify(projectIds);
  // Projects need the RPC transport. Demo mode reads only cached projects.
  const indexedIds = useMemo<readonly string[]>(
    () => (transport ? decodeProjectIds(idsKey) : []),
    [idsKey, transport],
  );
  const sources = useMemo<Source[]>(
    () => [
      ...(transport
        ? indexedIds.map((id) => ({
            id: `project:${id}`,
            queries: [
              sourceQuery(instanceInfoQueryOptions(transport, id)),
              sourceQuery(scriptListQueryOptions(transport, id)),
            ],
          }))
        : []),
      ...(includeServer
        ? [
            {
              id: "server",
              queries: [sourceQuery(serverInfoQueryOptions(transport))],
            },
          ]
        : []),
    ],
    [includeServer, indexedIds, transport],
  );

  // Re-read cached metadata when a request for it finishes.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          (event.action.type === "success" || event.action.type === "error") &&
          INDEXED_KEYS.some((key) =>
            matchQuery({ queryKey: [key] }, event.query),
          )
        )
          refresh();
      }),
    [queryClient],
  );

  useEffect(() => {
    if (!active || sources.length === 0) return undefined;
    const controller = new AbortController();
    const running = new Map<string, QueryKey>();
    setStatuses((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([, status]) => status === "loaded"),
      ),
    );
    void runBounded(
      sources.map((source) => async () => {
        for (const query of source.queries)
          running.set(JSON.stringify(query.queryKey), query.queryKey);
        const results = await Promise.allSettled(
          source.queries.map((query) => query.fetch(queryClient)),
        );
        for (const query of source.queries)
          running.delete(JSON.stringify(query.queryKey));
        if (controller.signal.aborted) return;
        const status = results.every((result) => result.status === "fulfilled")
          ? "loaded"
          : "failed";
        setStatuses((previous) => ({ ...previous, [source.id]: status }));
      }),
      PALETTE_INDEX_CONCURRENCY,
      controller.signal,
    );
    return () => {
      controller.abort();
      // Stop index requests nobody else is waiting for. A page that shows the
      // same data keeps its request.
      for (const queryKey of running.values()) {
        const query = queryClient.getQueryCache().find({ queryKey });
        if (query?.getObserversCount() === 0)
          void queryClient.cancelQueries({ queryKey, exact: true });
      }
    };
  }, [active, attempt, queryClient, sources]);

  return useMemo(() => {
    void revision;
    const projects: IndexedProject[] = indexedIds.flatMap((id) => {
      const project = queryClient.getQueryData<InstanceInfoQueryData>(
        queryKeys.instanceInfo(id),
      );
      // Failed refreshes can leave old data in the cache, including permissions.
      if (
        project?.id !== id ||
        queryClient.getQueryState(queryKeys.instanceInfo(id))?.status ===
          "error"
      )
        return [];
      const scripts =
        queryClient.getQueryState(["scripts", id])?.status === "error"
          ? undefined
          : queryClient.getQueryData<{
              scripts: IndexedProject["scripts"];
            }>(["scripts", id])?.scripts;
      return [{ project, scripts }];
    });
    // Demo projects without a transport may still be cached by their own pages.
    if (!transport)
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- idsKey is a JSON.stringify of a string array built in this hook
      for (const id of JSON.parse(idsKey) as string[]) {
        const project = queryClient.getQueryData<InstanceInfoQueryData>(
          queryKeys.instanceInfo(id),
        );
        if (project?.id === id) projects.push({ project });
      }
    const server =
      includeServer &&
      queryClient.getQueryState(["server-info"])?.status !== "error"
        ? queryClient.getQueryData<ServerInfoQueryData>(["server-info"])
        : undefined;
    const projectStatuses = indexedIds.map((id) => statuses[`project:${id}`]);
    return {
      projects,
      server,
      progress: {
        total: indexedIds.length,
        loaded: projectStatuses.filter((status) => status === "loaded").length,
        failed: projectStatuses.filter((status) => status === "failed").length,
        server: includeServer ? (statuses["server"] ?? "pending") : "none",
      },
      retry,
    };
  }, [
    idsKey,
    includeServer,
    indexedIds,
    queryClient,
    revision,
    statuses,
    transport,
  ]);
}

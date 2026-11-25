import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { Transport } from "@connectrpc/connect";
import {
  type FetchQueryOptions,
  matchQuery,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from "@tanstack/react-query";
import { Schema } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { useMemo } from "react";
import type { IndexedProject } from "@/lib/command-palette";
import {
  makePaletteIndexAtom,
  PALETTE_INDEX_GC_MS,
  PALETTE_INDEX_STALE_MS,
  type PaletteIndexProgress,
  type PaletteIndexSource,
  type PaletteIndexSourceQuery,
  type PaletteIndexStatuses,
  paletteIndexStatuses,
} from "@/lib/command-palette-index";
import { instanceInfoQueryOptions } from "@/lib/instance-info-query";
import { queryKeys } from "@/lib/query-keys";
import { scriptListQueryOptions } from "@/lib/script-service";
import { serverInfoQueryOptions } from "@/lib/server-info-query";
import type { InstanceInfoQueryData, ServerInfoQueryData } from "@/lib/types";

const INDEXED_KEYS = [
  queryKeys.instanceInfo("")[0],
  queryKeys.scripts("")[0],
  queryKeys.serverInfo()[0],
];
const decodeIndexKey = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      projectIds: Schema.Array(Schema.String),
      includeServer: Schema.Boolean,
    }),
  ),
);

function sourceQuery<TData, TKey extends QueryKey>(
  options: FetchQueryOptions<TData, Error, TData, TKey>,
): PaletteIndexSourceQuery {
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

function indexSources(
  transport: Transport | null,
  projectIds: readonly string[],
  includeServer: boolean,
): PaletteIndexSource[] {
  return [
    ...(transport
      ? projectIds.map((id) => ({
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
  ];
}

const cacheRevisionAtoms = new WeakMap<QueryClient, Atom.Atom<number>>();

/** Changes after a request for indexed metadata finishes. */
function cacheRevisionAtom(queryClient: QueryClient) {
  let atom = cacheRevisionAtoms.get(queryClient);
  if (!atom) {
    atom = makeCacheRevisionAtom(queryClient);
    cacheRevisionAtoms.set(queryClient, atom);
  }
  return atom;
}

function makeCacheRevisionAtom(queryClient: QueryClient) {
  return Atom.make((get) => {
    let revision = 0;
    get.addFinalizer(
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          (event.action.type === "success" || event.action.type === "error") &&
          INDEXED_KEYS.some((key) =>
            matchQuery({ queryKey: [key] }, event.query),
          )
        )
          get.setSelf(++revision);
      }),
    );
    return revision;
  });
}

const idleIndexAtom = Atom.make(AsyncResult.success<PaletteIndexStatuses>({}));
// Demo mode has no transport. It still indexes server settings.
const NO_TRANSPORT = {};
const indexAtomFamilies = new WeakMap<
  QueryClient,
  WeakMap<object, ReturnType<typeof indexAtomFamily>>
>();

function indexAtomFamily(
  queryClient: QueryClient,
  transport: Transport | null,
) {
  // The key is a JSON string, so a new array with the same IDs reuses the
  // running index.
  return Atom.family((key: string) => {
    const { projectIds, includeServer } = decodeIndexKey(key);
    // Closing the index interrupts it right away instead of after the
    // registry's idle delay.
    return makePaletteIndexAtom(
      queryClient,
      indexSources(transport, projectIds, includeServer),
    ).pipe(Atom.setIdleTTL(0));
  });
}

function paletteIndexAtom(
  queryClient: QueryClient,
  transport: Transport | null,
  key: string,
) {
  let families = indexAtomFamilies.get(queryClient);
  if (!families) {
    families = new WeakMap();
    indexAtomFamilies.set(queryClient, families);
  }
  const transportKey = transport ?? NO_TRANSPORT;
  let family = families.get(transportKey);
  if (!family) {
    family = indexAtomFamily(queryClient, transport);
    families.set(transportKey, family);
  }
  return family(key);
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
  const revision = useAtomValue(cacheRevisionAtom(queryClient));
  // A new array with the same IDs must not restart the index.
  const key = JSON.stringify({ projectIds, includeServer });
  // Projects need the RPC transport. Demo mode reads only cached projects.
  const indexAtom =
    active && ((transport && projectIds.length > 0) || includeServer)
      ? paletteIndexAtom(queryClient, transport, key)
      : idleIndexAtom;
  const indexResult = useAtomValue(indexAtom);
  const statuses = paletteIndexStatuses(indexResult);
  const retry = useAtomRefresh(indexAtom);

  return useMemo(() => {
    void revision;
    const { projectIds: ids } = decodeIndexKey(key);
    const indexedIds = transport ? ids : [];
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
      for (const id of ids) {
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
  }, [includeServer, key, queryClient, retry, revision, statuses, transport]);
}

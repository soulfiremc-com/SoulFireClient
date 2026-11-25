import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { Effect, Option } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

/** Projects whose metadata loads at the same time during global search. */
export const PALETTE_INDEX_CONCURRENCY = 3;
/** Metadata newer than this is reused instead of requested again. */
export const PALETTE_INDEX_STALE_MS = 120_000;
/** Unobserved metadata stays cached this long for later searches. */
export const PALETTE_INDEX_GC_MS = 30 * 60_000;

export interface PaletteIndexSourceQuery {
  queryKey: QueryKey;
  fetch: (queryClient: QueryClient) => Promise<unknown>;
}
export interface PaletteIndexSource {
  id: string;
  queries: readonly PaletteIndexSourceQuery[];
}
export type PaletteIndexSourceStatus = "loaded" | "failed";
export type PaletteIndexStatuses = Readonly<
  Record<string, PaletteIndexSourceStatus>
>;

const NO_STATUSES: PaletteIndexStatuses = {};

/** Reads index statuses, including progress published while a run is busy. */
export function paletteIndexStatuses(
  result: AsyncResult.AsyncResult<PaletteIndexStatuses>,
): PaletteIndexStatuses {
  return AsyncResult.getOrElse(result, () => NO_STATUSES);
}

/**
 * Loads every source with at most `PALETTE_INDEX_CONCURRENCY` running at once
 * and publishes each source's status as it settles. A refresh keeps loaded
 * sources and loads the others again. Interruption starts no further sources
 * and cancels index requests nobody else observes.
 */
export function makePaletteIndexAtom(
  queryClient: QueryClient,
  sources: readonly PaletteIndexSource[],
): Atom.Atom<AsyncResult.AsyncResult<PaletteIndexStatuses>> {
  return Atom.make((get) => {
    const previous = Option.getOrUndefined(
      get.self<AsyncResult.AsyncResult<PaletteIndexStatuses>>(),
    );
    let statuses: PaletteIndexStatuses = Object.fromEntries(
      Object.entries(previous ? paletteIndexStatuses(previous) : {}).filter(
        ([, status]) => status === "loaded",
      ),
    );
    get.setSelf(AsyncResult.success(statuses, { waiting: true }));
    return Effect.forEach(
      sources.filter((source) => statuses[source.id] !== "loaded"),
      (source) =>
        Effect.promise(() =>
          Promise.allSettled(
            source.queries.map((query) => query.fetch(queryClient)),
          ),
        ).pipe(
          Effect.map((results) =>
            results.every((result) => result.status === "fulfilled")
              ? ("loaded" as const)
              : ("failed" as const),
          ),
          Effect.tap((status) =>
            Effect.sync(() => {
              statuses = { ...statuses, [source.id]: status };
              get.setSelf(AsyncResult.success(statuses, { waiting: true }));
            }),
          ),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              // Stop index requests nobody else is waiting for. A page that
              // shows the same data keeps its request.
              for (const { queryKey } of source.queries) {
                const query = queryClient.getQueryCache().find({ queryKey });
                if (query?.getObserversCount() === 0)
                  void queryClient.cancelQueries({ queryKey, exact: true });
              }
            }),
          ),
        ),
      { concurrency: PALETTE_INDEX_CONCURRENCY, discard: true },
    ).pipe(Effect.map(() => statuses));
  });
}

export interface PaletteIndexProgress {
  /** Projects in the index, excluding the project already in context. */
  total: number;
  loaded: number;
  failed: number;
  server: "none" | "pending" | "loaded" | "failed";
}

export function isPaletteIndexComplete(progress: PaletteIndexProgress) {
  return (
    progress.loaded + progress.failed >= progress.total &&
    progress.server !== "pending"
  );
}

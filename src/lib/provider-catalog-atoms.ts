import type { Effect } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { loadLocaltsProducts } from "@/lib/localts.ts";
import { loadRavealtsStock } from "@/lib/ravealts.ts";

/**
 * Loads a catalog while a flow shows it. Writing a catalog replaces it with a
 * fresher copy, and refreshing loads it again. Closing the flow interrupts
 * the request.
 */
export function makeCatalogAtom<A, E>(load: Effect.Effect<A, E>) {
  const loaded = Atom.make(load).pipe(Atom.setIdleTTL(0));
  return Atom.writable(
    (get) => get(loaded),
    (ctx, catalog: A) => {
      ctx.setSelf(AsyncResult.success(catalog));
    },
    (refresh) => {
      refresh(loaded);
    },
  ).pipe(Atom.setIdleTTL(0));
}

export const localtsCatalogAtom = makeCatalogAtom(loadLocaltsProducts);
export const ravealtsStockAtom = makeCatalogAtom(loadRavealtsStock);

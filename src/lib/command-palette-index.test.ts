import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { AtomRegistry } from "effect/reactivity";
import {
  isPaletteIndexComplete,
  makePaletteIndexAtom,
  PALETTE_INDEX_CONCURRENCY,
  type PaletteIndexSource,
  paletteIndexStatuses,
} from "./command-palette-index";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const hang = () => new Promise<never>(() => {});
const fetchHanging = (key: string) => (client: QueryClient) =>
  client.fetchQuery({ queryKey: ["index-test", key], queryFn: hang });

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function source(
  id: string,
  fetch: (queryClient: QueryClient) => Promise<unknown>,
): PaletteIndexSource {
  return { id, queries: [{ queryKey: ["index-test", id], fetch }] };
}

test("index sources run in order with bounded concurrency", async () => {
  const gates = Array.from({ length: 5 }, () => deferred());
  const started: number[] = [];
  const atom = makePaletteIndexAtom(
    new QueryClient(),
    gates.map((gate, index) =>
      source(String(index), async () => {
        started.push(index);
        await gate.promise;
      }),
    ),
  );
  const registry = AtomRegistry.make();
  registry.mount(atom);
  await settle();
  assert.equal(started.length, PALETTE_INDEX_CONCURRENCY);
  assert.deepEqual(started, [0, 1, 2]);
  gates[1]?.resolve();
  await settle();
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.deepEqual(paletteIndexStatuses(registry.get(atom)), { 1: "loaded" });
  for (const gate of gates) gate.resolve();
  await settle();
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  assert.equal(registry.get(atom)._tag, "Success");
  assert.equal(registry.get(atom).waiting, false);
});

test("retry loads failed sources again and keeps loaded ones", async () => {
  const calls: string[] = [];
  let failing = true;
  const atom = makePaletteIndexAtom(new QueryClient(), [
    source("ok", async () => {
      calls.push("ok");
    }),
    source("flaky", async () => {
      calls.push("flaky");
      if (failing) throw new Error("Test failure");
    }),
  ]);
  const registry = AtomRegistry.make();
  registry.mount(atom);
  await settle();
  assert.deepEqual(paletteIndexStatuses(registry.get(atom)), {
    ok: "loaded",
    flaky: "failed",
  });
  failing = false;
  registry.refresh(atom);
  // The failed source counts as pending again until its retry settles.
  assert.deepEqual(paletteIndexStatuses(registry.get(atom)), { ok: "loaded" });
  await settle();
  assert.deepEqual(paletteIndexStatuses(registry.get(atom)), {
    ok: "loaded",
    flaky: "loaded",
  });
  assert.deepEqual(calls, ["ok", "flaky", "flaky"]);
});

test("stopping the index cancels only requests nobody observes", async () => {
  const queryClient = new QueryClient();
  const atom = makePaletteIndexAtom(queryClient, [
    source("unobserved", fetchHanging("unobserved")),
    source("observed", fetchHanging("observed")),
    source("third", fetchHanging("third")),
    source("not-started", fetchHanging("not-started")),
  ]);
  // A page observes the same data, so its request must keep running.
  const unobservePage = new QueryObserver(queryClient, {
    queryKey: ["index-test", "observed"],
    enabled: false,
  }).subscribe(() => {});
  const registry = AtomRegistry.make();
  const unmount = registry.mount(atom);
  await settle();
  unmount();
  registry.dispose();
  await settle();
  const state = (key: string) =>
    queryClient.getQueryState(["index-test", key])?.fetchStatus;
  assert.equal(state("unobserved"), "idle");
  assert.equal(state("observed"), "fetching");
  assert.equal(state("not-started"), undefined);
  unobservePage();
});

test("the index is complete only when every project and the server settled", () => {
  const progress = { total: 2, loaded: 1, failed: 1, server: "none" } as const;
  assert.equal(isPaletteIndexComplete(progress), true);
  assert.equal(isPaletteIndexComplete({ ...progress, loaded: 0 }), false);
  assert.equal(
    isPaletteIndexComplete({ ...progress, server: "pending" }),
    false,
  );
  assert.equal(isPaletteIndexComplete({ ...progress, server: "failed" }), true);
});

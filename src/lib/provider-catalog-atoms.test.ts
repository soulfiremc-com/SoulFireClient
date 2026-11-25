import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Option } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { makeCatalogAtom } from "./provider-catalog-atoms.ts";

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

test("a written catalog clears a failed load, and a refresh loads it again", async () => {
  let loads = 0;
  const atom = makeCatalogAtom(
    Effect.suspend(() =>
      ++loads === 1 ? Effect.fail("offline") : Effect.succeed(`load ${loads}`),
    ),
  );
  const registry = AtomRegistry.make();
  const unmount = registry.mount(atom);
  try {
    await settle();
    assert.equal(AsyncResult.isFailure(registry.get(atom)), true);
    registry.set(atom, "connected");
    assert.equal(
      Option.getOrNull(AsyncResult.value(registry.get(atom))),
      "connected",
    );
    registry.refresh(atom);
    await settle();
    assert.equal(
      Option.getOrNull(AsyncResult.value(registry.get(atom))),
      "load 2",
    );
  } finally {
    unmount();
  }
});

test("closing the flow interrupts a catalog request", async () => {
  let interrupted = false;
  const atom = makeCatalogAtom(
    Effect.never.pipe(
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted = true;
        }),
      ),
    ),
  );
  const registry = AtomRegistry.make();
  const unmount = registry.mount(atom);
  await settle();
  assert.equal(interrupted, false);
  unmount();
  await settle();
  assert.equal(interrupted, true);
});

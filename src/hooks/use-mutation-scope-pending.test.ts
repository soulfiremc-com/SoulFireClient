import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { createMutationScopePendingStore } from "./use-mutation-scope-pending";

function client() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  });
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("mutation scope pending state", () => {
  test("reads settlement after missing notifications while unsubscribed", async () => {
    const queryClient = client();
    const scopeId = crypto.randomUUID();
    const store = createMutationScopePendingStore(queryClient, scopeId);
    const gate = deferred();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      scope: { id: scopeId },
      mutationFn: () => gate.promise,
    });
    let notifications = 0;
    const listener = () => {
      notifications++;
    };
    const unsubscribe = store.subscribe(listener);
    assert.equal(store.getSnapshot(), false);
    const result = mutation.execute(undefined);
    assert.equal(store.getSnapshot(), true);
    assert.ok(notifications > 0);
    unsubscribe();
    gate.resolve();
    await result;
    assert.equal(store.getSnapshot(), false);
    const resubscribe = store.subscribe(listener);
    assert.equal(store.getSnapshot(), false);
    resubscribe();
    queryClient.clear();
  });

  test("ignores mutations owned by another scope", async () => {
    const queryClient = client();
    const scopeId = crypto.randomUUID();
    const otherScopeId = crypto.randomUUID();
    const store = createMutationScopePendingStore(queryClient, scopeId);
    const gate = deferred();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      scope: { id: otherScopeId },
      mutationFn: () => gate.promise,
    });
    const result = mutation.execute(undefined);
    assert.equal(queryClient.isMutating(), 1);
    assert.equal(store.getSnapshot(), false);
    gate.resolve();
    await result;
    queryClient.clear();
  });

  test("stays pending for queued work and clears after failure", async () => {
    const queryClient = client();
    const scopeId = crypto.randomUUID();
    const store = createMutationScopePendingStore(queryClient, scopeId);
    const first = deferred();
    const second = deferred();
    const secondStarted = deferred();
    const cache = queryClient.getMutationCache();
    const firstResult = cache
      .build(queryClient, {
        scope: { id: scopeId },
        mutationFn: () => first.promise,
      })
      .execute(undefined);
    const secondResult = cache
      .build(queryClient, {
        scope: { id: scopeId },
        mutationFn: () => {
          secondStarted.resolve();
          return second.promise;
        },
      })
      .execute(undefined);
    first.resolve();
    await firstResult;
    await secondStarted.promise;
    assert.equal(store.getSnapshot(), true);
    const failure = new Error();
    const rejected = secondResult.catch((error) => error);
    second.reject(failure);
    assert.equal(await rejected, failure);
    assert.equal(store.getSnapshot(), false);
    queryClient.clear();
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { createMutationScopePendingStore } from "@/hooks/use-mutation-scope-pending";
import { dialogMutationOptions } from "./dialog-mutation-options";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test("a replacement dialog does not adopt or wait for the old screen's action", async () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity } },
  });
  const instanceId = crypto.randomUUID();
  const botId = crypto.randomUUID();
  const original = dialogMutationOptions(
    instanceId,
    botId,
    crypto.randomUUID(),
  );
  const replacement = dialogMutationOptions(
    instanceId,
    botId,
    crypto.randomUUID(),
  );
  const originalStore = createMutationScopePendingStore(
    client,
    original.scope.id,
  );
  const replacementStore = createMutationScopePendingStore(
    client,
    replacement.scope.id,
  );
  const gate = deferred();
  const started = deferred();
  const observer = new MutationObserver(client, {
    ...original,
    mutationFn: () => {
      started.resolve();
      return gate.promise;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const pending = observer.mutate();
  try {
    await started.promise;
    observer.setOptions({ ...replacement, mutationFn: async () => {} });
    assert.equal(observer.getCurrentResult().isIdle, true);
    assert.equal(originalStore.getSnapshot(), true);
    assert.equal(replacementStore.getSnapshot(), false);
    await observer.mutate();
    assert.equal(originalStore.getSnapshot(), true);
    assert.equal(replacementStore.getSnapshot(), false);
  } finally {
    gate.resolve();
    await pending;
    unsubscribe();
    client.clear();
  }
});

test("dialog pending state settles after its observer unsubscribes", async () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity } },
  });
  const options = dialogMutationOptions(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
  const store = createMutationScopePendingStore(client, options.scope.id);
  const gate = deferred();
  const started = deferred();
  const observer = new MutationObserver(client, {
    ...options,
    mutationFn: () => {
      started.resolve();
      return gate.promise;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const pending = observer.mutate();
  try {
    await started.promise;
    assert.equal(store.getSnapshot(), true);
    assert.equal(observer.getCurrentResult().isPending, true);
    unsubscribe();
    gate.resolve();
    await pending;
    assert.equal(store.getSnapshot(), false);
  } finally {
    gate.resolve();
    await pending;
    unsubscribe();
    client.clear();
  }
});

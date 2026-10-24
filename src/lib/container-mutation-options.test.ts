import assert from "node:assert/strict";
import { test } from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { containerMutationOptions } from "./container-mutation-options";

const instanceId = crypto.randomUUID();
const botId = crypto.randomUUID();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function client() {
  return new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
}

test("different actions in one menu execute in order", async () => {
  const cache = client();
  const menuId = crypto.randomUUID();
  const response = deferred<number>();
  const started = deferred<void>();
  const calls: number[] = [];
  const text = new MutationObserver(cache, {
    ...containerMutationOptions(instanceId, botId, menuId, "text"),
    mutationFn: () => {
      calls.push(1);
      started.resolve();
      return response.promise;
    },
  });
  const click = new MutationObserver(cache, {
    ...containerMutationOptions(instanceId, botId, menuId, "click"),
    mutationFn: async () => {
      calls.push(2);
    },
  });
  const pending = text.mutate();
  let queued: Promise<void> | undefined;
  try {
    await started.promise;
    queued = click.mutate();
    assert.equal(click.getCurrentResult().isPaused, true);
    assert.deepEqual(calls, [1]);
    response.resolve(1);
    await Promise.all([pending, queued]);
    assert.deepEqual(calls, [1, 2]);
  } finally {
    response.resolve(1);
    await Promise.allSettled([pending, queued]);
    cache.clear();
  }
});

test("a replacement menu can close while the old menu's save response is pending", async () => {
  const cache = client();
  const response = deferred<void>();
  const started = deferred<void>();
  const text = new MutationObserver(cache, {
    ...containerMutationOptions(instanceId, botId, crypto.randomUUID(), "text"),
    mutationFn: () => {
      started.resolve();
      return response.promise;
    },
  });
  const close = new MutationObserver(cache, {
    ...containerMutationOptions(
      instanceId,
      botId,
      crypto.randomUUID(),
      "close",
    ),
    mutationFn: async () => 1,
  });
  const pending = text.mutate();
  let replacement: Promise<number> | undefined;
  try {
    await started.promise;
    replacement = close.mutate();
    assert.equal(close.getCurrentResult().isPaused, false);
    assert.equal(await replacement, 1);
    assert.equal(text.getCurrentResult().isPending, true);
  } finally {
    response.resolve();
    await Promise.allSettled([pending, replacement]);
    cache.clear();
  }
});

test("changing menus resets pending controls without moving the old request into the new scope", async () => {
  const cache = client();
  const original = containerMutationOptions(
    instanceId,
    botId,
    crypto.randomUUID(),
    "text",
  );
  const response = deferred<number>();
  const started = deferred<void>();
  const observer = new MutationObserver(cache, {
    ...original,
    mutationFn: () => {
      started.resolve();
      return response.promise;
    },
  });
  const pending = observer.mutate();
  let replacement: Promise<number> | undefined;
  try {
    await started.promise;
    const oldRequest = cache.getMutationCache().getAll()[0]!;
    observer.setOptions({
      ...containerMutationOptions(
        instanceId,
        botId,
        crypto.randomUUID(),
        "text",
      ),
      mutationFn: async () => 2,
    });
    assert.equal(observer.getCurrentResult().isIdle, true);
    assert.equal(oldRequest.options.scope, original.scope);
    replacement = observer.mutate();
    assert.equal(observer.getCurrentResult().isPaused, false);
    assert.equal(await replacement, 2);
    response.resolve(1);
    await pending;
    assert.equal(observer.getCurrentResult().data, 2);
  } finally {
    response.resolve(1);
    await Promise.allSettled([pending, replacement]);
    cache.clear();
  }
});

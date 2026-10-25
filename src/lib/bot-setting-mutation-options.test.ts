import assert from "node:assert/strict";
import { test } from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { botSettingMutationOptions } from "./bot-setting-mutation-options";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const instanceId = crypto.randomUUID();
const botId = crypto.randomUUID();
const options = (action: "value" | "reset" | "toggle") =>
  botSettingMutationOptions(instanceId, botId, "plugin", "enabled", action);
const client = () =>
  new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });

test("reset runs after every previously queued edit to the setting", async () => {
  const cache = client();
  const held = deferred<void>();
  const started = deferred<void>();
  let stored: boolean | undefined;
  const writes: (boolean | undefined)[] = [];
  const edit = new MutationObserver(cache, {
    ...options("value"),
    mutationFn: async (value: boolean) => {
      stored = value;
      writes.push(value);
      if (writes.length === 1) {
        started.resolve();
        await held.promise;
      }
    },
  });
  const reset = new MutationObserver(cache, {
    ...options("reset"),
    mutationFn: async () => {
      stored = undefined;
      writes.push(undefined);
    },
  });
  const first = edit.mutate(true);
  let latest: Promise<void> | undefined;
  let removal: Promise<void> | undefined;
  try {
    await started.promise;
    latest = edit.mutate(false);
    removal = reset.mutate();
    assert.equal(reset.getCurrentResult().isPaused, true);
    assert.deepEqual(writes, [true]);
    held.resolve();
    await Promise.all([first, latest, removal]);
    assert.deepEqual(writes, [true, false, undefined]);
    assert.equal(stored, undefined);
  } finally {
    held.resolve();
    await Promise.allSettled([first, latest, removal]);
    cache.clear();
  }
});

test("a rejected edit allows a queued reset and plugin toggle to proceed", async () => {
  const cache = client();
  const held = deferred<void>();
  const started = deferred<void>();
  const writes: (boolean | undefined)[] = [];
  const edit = new MutationObserver(cache, {
    ...options("value"),
    mutationFn: async () => {
      started.resolve();
      await held.promise;
      throw new Error("Save failed");
    },
  });
  const reset = new MutationObserver(cache, {
    ...options("reset"),
    mutationFn: async () => {
      writes.push(undefined);
    },
  });
  const toggle = new MutationObserver(cache, {
    ...options("toggle"),
    mutationFn: async (value: boolean) => {
      writes.push(value);
    },
  });
  const failure = assert.rejects(edit.mutate());
  let removal: Promise<void> | undefined;
  let enabled: Promise<void> | undefined;
  try {
    await started.promise;
    removal = reset.mutate();
    enabled = toggle.mutate(true);
    assert.equal(reset.getCurrentResult().isPaused, true);
    assert.equal(toggle.getCurrentResult().isPaused, true);
    held.resolve();
    await Promise.all([failure, removal, enabled]);
    assert.deepEqual(writes, [undefined, true]);
  } finally {
    held.resolve();
    await Promise.allSettled([failure, removal, enabled]);
    cache.clear();
  }
});

test("other instances, bots and entries can save while one setting is pending", async () => {
  const cache = client();
  const held = deferred<void>();
  const started = deferred<void>();
  const edit = new MutationObserver(cache, {
    ...options("value"),
    mutationFn: async () => {
      started.resolve();
      await held.promise;
    },
  });
  const pending = edit.mutate();
  const independent: Promise<void>[] = [];
  try {
    await started.promise;
    for (const [instance, bot, namespace, key] of [
      [crypto.randomUUID(), botId, "plugin", "enabled"],
      [instanceId, crypto.randomUUID(), "plugin", "enabled"],
      [instanceId, botId, "other", "enabled"],
      [instanceId, botId, "plugin", "other"],
    ]) {
      const other = new MutationObserver(cache, {
        ...botSettingMutationOptions(
          instance!,
          bot!,
          namespace!,
          key!,
          "reset",
        ),
        mutationFn: async () => {},
      });
      independent.push(other.mutate());
      assert.equal(other.getCurrentResult().isPaused, false);
    }
    await Promise.all(independent);
    assert.equal(edit.getCurrentResult().isPending, true);
  } finally {
    held.resolve();
    await Promise.allSettled([pending, ...independent]);
    cache.clear();
  }
});

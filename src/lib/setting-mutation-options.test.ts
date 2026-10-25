import assert from "node:assert/strict";
import { test } from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { settingMutationOptions } from "./setting-mutation-options";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const instanceA = {
  type: "instance",
  instanceId: crypto.randomUUID(),
} as const;
const instanceB = {
  type: "instance",
  instanceId: crypto.randomUUID(),
} as const;
const client = () =>
  new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });

test("a pending instance save does not block other configuration targets", async () => {
  const cache = client();
  const held = deferred<void>();
  const started = deferred<void>();
  const first = new MutationObserver(cache, {
    ...settingMutationOptions(instanceA, "plugin", "value", "value"),
    mutationFn: async () => {
      started.resolve();
      await held.promise;
    },
  });
  const pending = first.mutate();
  const independent: Promise<void>[] = [];
  try {
    await started.promise;
    for (const target of [
      instanceB,
      { type: "server" } as const,
      {
        type: "bot",
        instanceId: instanceA.instanceId,
        botId: crypto.randomUUID(),
      } as const,
    ]) {
      const other = new MutationObserver(cache, {
        ...settingMutationOptions(target, "plugin", "value", "value"),
        mutationFn: async () => {},
      });
      independent.push(other.mutate());
      assert.equal(other.getCurrentResult().isPaused, false);
    }
    await Promise.all(independent);
    assert.equal(first.getCurrentResult().isPending, true);
  } finally {
    held.resolve();
    await Promise.allSettled([pending, ...independent]);
    cache.clear();
  }
});

test("switching instances detaches a queued save without retargeting it", async () => {
  const cache = client();
  const held = deferred<void>();
  const started = deferred<void>();
  const writes: string[] = [];
  const observer = new MutationObserver(cache, {
    ...settingMutationOptions(instanceA, "plugin", "value", "value"),
    mutationFn: async (value: string) => {
      writes.push(`a:${value}`);
      if (writes.length === 1) {
        started.resolve();
        await held.promise;
      }
    },
  });
  const first = observer.mutate("first");
  let queued: Promise<void> | undefined;
  let replacement: Promise<void> | undefined;
  try {
    await started.promise;
    queued = observer.mutate("last");
    assert.equal(observer.getCurrentResult().isPaused, true);
    observer.setOptions({
      ...settingMutationOptions(instanceB, "plugin", "value", "value"),
      mutationFn: async (value: string) => {
        writes.push(`b:${value}`);
      },
    });
    assert.equal(observer.getCurrentResult().isIdle, true);
    replacement = observer.mutate("only");
    assert.equal(observer.getCurrentResult().isPaused, false);
    await replacement;
    held.resolve();
    await Promise.all([first, queued]);
    assert.deepEqual(writes, ["a:first", "b:only", "a:last"]);
  } finally {
    held.resolve();
    await Promise.allSettled([first, queued, replacement]);
    cache.clear();
  }
});

const instanceId = crypto.randomUUID();
const botId = crypto.randomUUID();
const options = (action: "value" | "reset" | "toggle") =>
  settingMutationOptions(
    { type: "bot", instanceId, botId },
    "plugin",
    "enabled",
    action,
  );

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
        ...settingMutationOptions(
          { type: "bot", instanceId: instance!, botId: bot! },
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

import assert from "node:assert/strict";
import { test } from "node:test";
import { CancelledError, QueryClient } from "@tanstack/react-query";
import {
  getQuerySessionId,
  resetQuerySession,
  synchronizeQuerySession,
} from "./query-session.ts";
import { assertDefined } from "@/lib/assert-defined";

async function withBrowser(
  run: (browser: {
    storage: Storage;
    reloads: () => number;
    storageEvent: (key: string | null, area?: Storage) => void;
  }) => Promise<void>,
) {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    key: (index) => Array.from(values.keys())[index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
  let reloads = 0;
  const browser = Object.assign(new EventTarget(), {
    localStorage: storage,
    location: {
      reload: () => {
        reloads += 1;
      },
    },
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browser,
  });
  try {
    await run({
      storage,
      reloads: () => reloads,
      storageEvent: (key, storageArea = storage) => {
        const event = new Event("storage");
        Object.defineProperties(event, {
          key: { value: key },
          storageArea: { value: storageArea },
        });
        browser.dispatchEvent(event);
      },
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("credential changes cancel old queries and distinguish local and remote session changes", () =>
  withBrowser(async ({ storage, reloads, storageEvent }) => {
    const client = new QueryClient();
    const stop = synchronizeQuerySession(client);
    let aborted = false;
    const fetch = client
      .fetchQuery({
        queryKey: ["pending"],
        queryFn: ({ signal }) =>
          new Promise<number>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      })
      .catch((error: unknown) => error);
    try {
      const original = getQuerySessionId();
      resetQuerySession();
      assert.notEqual(getQuerySessionId(), original);
      assert.equal(aborted, true);
      assert.equal((await fetch) instanceof CancelledError, true);
      assert.equal(reloads(), 0);
      assert.equal(client.getQueryCache().getAll().length, 0);

      client.setQueryData(["retained"], 3);
      storageEvent("theme");
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
      storageEvent(null, {} as Storage);
      assert.equal(client.getQueryData(["retained"]), 3);
      const key = assertDefined(
        storage.key(0),
        "Expected storage.key(0) to exist",
      );
      storage.setItem(key, crypto.randomUUID());
      storageEvent(key);
      assert.equal(reloads(), 1);
      assert.equal(client.getQueryData(["retained"]), undefined);
      storageEvent(key);
      assert.equal(reloads(), 1);
      storage.clear();
      storageEvent(null);
      assert.equal(reloads(), 2);
      stop();
      storage.clear();
      storageEvent(null);
      assert.equal(reloads(), 2);
    } finally {
      stop();
      client.clear();
    }
  }));

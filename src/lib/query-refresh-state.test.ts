import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { hasFailedRefresh } from "./query-refresh-state.ts";

test("cached refresh failures remain visible until successful recovery", async () => {
  const client = new QueryClient();
  let failing = true;
  const options = {
    queryKey: ["fleet"],
    queryFn: async () => {
      if (failing) throw new Error("Unavailable");
      return 2;
    },
    retry: false as const,
    staleTime: Infinity,
  };
  client.setQueryData(options.queryKey, 4);
  const observer = new QueryObserver(client, options);
  const stop = observer.subscribe(() => {});
  try {
    const query = observer.getCurrentQuery();
    assert.equal(hasFailedRefresh(query), false);
    await observer.refetch();
    assert.equal(query.state.data, 4);
    assert.equal(hasFailedRefresh(query), true);
    failing = false;
    await observer.refetch();
    assert.equal(query.state.data, 2);
    assert.equal(hasFailedRefresh(query), false);
  } finally {
    stop();
    client.clear();
  }
});

test("an in-progress automatic retry still marks cached data as outdated", async () => {
  const client = new QueryClient();
  let retryStarted!: () => void;
  const retried = new Promise<void>((resolve) => {
    retryStarted = resolve;
  });
  let recover!: (value: number) => void;
  const recovery = new Promise<number>((resolve) => {
    recover = resolve;
  });
  let attempts = 0;
  const options = {
    queryKey: ["fleet"],
    queryFn: async () => {
      if (++attempts === 1) throw new Error("Unavailable");
      retryStarted();
      return recovery;
    },
    retry: 1,
    retryDelay: 0,
    staleTime: Infinity,
  };
  client.setQueryData(options.queryKey, 4);
  const observer = new QueryObserver(client, options);
  const stop = observer.subscribe(() => {});
  try {
    const refresh = observer.refetch();
    await retried;
    const query = observer.getCurrentQuery();
    assert.equal(query.state.fetchStatus, "fetching");
    assert.equal(hasFailedRefresh(query), true);
    recover(2);
    await refresh;
    assert.equal(hasFailedRefresh(query), false);
  } finally {
    recover(2);
    stop();
    client.clear();
  }
});

test("initial failures, disabled queries and inactive caches do not warn about stale data", async () => {
  const client = new QueryClient();
  const options = {
    queryKey: ["fleet"],
    queryFn: async () => {
      throw new Error("Unavailable");
    },
    retry: false as const,
    staleTime: Infinity,
  };
  const observer = new QueryObserver(client, options);
  const stop = observer.subscribe(() => {});
  try {
    await observer.refetch();
    const query = observer.getCurrentQuery();
    assert.equal(hasFailedRefresh(query), false);
    client.setQueryData(options.queryKey, 4);
    await observer.refetch();
    assert.equal(hasFailedRefresh(query), true);
    observer.setOptions({ ...options, enabled: false });
    assert.equal(hasFailedRefresh(query), false);
    observer.setOptions(options);
    stop();
    assert.equal(hasFailedRefresh(query), false);
  } finally {
    stop();
    client.clear();
  }
});

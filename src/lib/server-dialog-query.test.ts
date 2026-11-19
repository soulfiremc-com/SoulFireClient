import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { QueryClient } from "@tanstack/react-query";
import {
  BotGetDialogResponseSchema,
  ServerDialogSchema,
} from "@/generated/soulfire/bot_pb";
import { applyServerDialogRefresh } from "./server-dialog-query";
import { assertDefined } from "@/lib/assert-defined";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const queryKey = ["bot-dialog", crypto.randomUUID(), crypto.randomUUID()];
const dialog = () =>
  create(BotGetDialogResponseSchema, {
    dialog: create(ServerDialogSchema, { screenId: crypto.randomUUID() }),
  });

test("an old action refresh preserves its replacement and its pending poll", async () => {
  const client = new QueryClient();
  const original = dialog();
  client.setQueryData(queryKey, original);
  const oldResponse = deferred<ReturnType<typeof dialog>>();
  const refresh = oldResponse.promise.then((state) =>
    applyServerDialogRefresh(
      client,
      queryKey,
      assertDefined(original.dialog, "Expected original.dialog to exist")
        .screenId,
      state,
    ),
  );
  const replacement = dialog();
  client.setQueryData(queryKey, replacement);
  const cached = client.getQueryData(queryKey);
  const nextPoll = deferred<ReturnType<typeof dialog>>();
  let aborted = false;
  // oxlint-disable-next-line tanstack-query/exhaustive-deps -- The deferred response represents an in-flight poll for the exact cache entry under test.
  const poll = client.fetchQuery({
    queryKey,
    queryFn: ({ signal }) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return nextPoll.promise;
    },
  });
  try {
    oldResponse.resolve(original);
    await refresh;
    assert.equal(client.getQueryData(queryKey), cached);
    assert.equal(aborted, false);
    nextPoll.resolve(replacement);
    await poll;
  } finally {
    nextPoll.resolve(replacement);
    await poll.catch(() => {});
    client.clear();
  }
});

test("a delayed refresh cannot resurrect a closed or removed dialog", async () => {
  const original = dialog();
  for (const current of [create(BotGetDialogResponseSchema), undefined]) {
    const client = new QueryClient();
    try {
      if (current) client.setQueryData(queryKey, current);
      await applyServerDialogRefresh(
        client,
        queryKey,
        assertDefined(original.dialog, "Expected original.dialog to exist")
          .screenId,
        original,
      );
      assert.equal(client.getQueryData(queryKey), current);
      assert.equal(client.getQueryCache().getAll().length, current ? 1 : 0);
    } finally {
      client.clear();
    }
  }
});

test("an accepted action can replace or close the screen it acted on", async () => {
  const original = dialog();
  for (const state of [dialog(), create(BotGetDialogResponseSchema)]) {
    const client = new QueryClient();
    try {
      client.setQueryData(queryKey, original);
      await applyServerDialogRefresh(
        client,
        queryKey,
        assertDefined(original.dialog, "Expected original.dialog to exist")
          .screenId,
        state,
      );
      assert.deepEqual(client.getQueryData(queryKey), state);
    } finally {
      client.clear();
    }
  }
});

test("a screen replacement during query cancellation is also preserved", async () => {
  const client = new QueryClient();
  const original = dialog();
  const replacement = dialog();
  const cancelling = deferred<undefined>();
  const release = deferred<undefined>();
  const cancel = client.cancelQueries.bind(client);
  client.cancelQueries = async (filters, options) => {
    await cancel(filters, options);
    cancelling.resolve(undefined);
    await release.promise;
  };
  client.setQueryData(queryKey, original);
  const refresh = applyServerDialogRefresh(
    client,
    queryKey,
    assertDefined(original.dialog, "Expected original.dialog to exist")
      .screenId,
    original,
  );
  try {
    await cancelling.promise;
    client.setQueryData(queryKey, replacement);
    const cached = client.getQueryData(queryKey);
    release.resolve(undefined);
    await refresh;
    assert.equal(client.getQueryData(queryKey), cached);
  } finally {
    release.resolve(undefined);
    await refresh;
    client.clear();
  }
});

test("a failed read invalidates state without failing the accepted action", async () => {
  const client = new QueryClient();
  const original = dialog();
  try {
    client.setQueryData(queryKey, original);
    await applyServerDialogRefresh(
      client,
      queryKey,
      assertDefined(original.dialog, "Expected original.dialog to exist")
        .screenId,
      undefined,
    );
    assert.deepEqual(client.getQueryData(queryKey), original);
    assert.equal(client.getQueryState(queryKey)?.isInvalidated, true);
  } finally {
    client.clear();
  }
});

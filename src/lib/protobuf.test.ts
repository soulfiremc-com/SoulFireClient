import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { Stream } from "effect";
import {
  jsonToValue,
  observeServerStream,
  parseJsonValue,
  valueToJson,
} from "./protobuf.ts";
import { rpcStream } from "./rpc";

test("stream observers await each handler and complete after releasing the subscription", async () => {
  const events: string[] = [];
  let closed = false;
  const stream = rpcStream("Test.Watch", async function* () {
    try {
      yield 1;
      yield 2;
    } finally {
      closed = true;
    }
  });
  await observeServerStream(stream, {
    onMessage: async (value) => {
      events.push(`start ${value}`);
      await Promise.resolve();
      events.push(`end ${value}`);
    },
    onComplete: () => {
      assert.equal(closed, true);
      events.push("complete");
    },
  });
  assert.deepEqual(events, [
    "start 1",
    "end 1",
    "start 2",
    "end 2",
    "complete",
  ]);
});

test("stream handler failures release the subscription before reporting the original error", async () => {
  const failure = new Error("Import failed");
  let closed = false;
  let received: unknown;
  let completed = false;
  const stream = rpcStream("Test.Watch", async function* () {
    try {
      yield 1;
      yield 2;
    } finally {
      closed = true;
    }
  });
  await observeServerStream(stream, {
    onMessage: async () => {
      throw failure;
    },
    onError: (error) => {
      assert.equal(closed, true);
      received = error;
    },
    onComplete: () => {
      completed = true;
    },
  });
  assert.equal(received, failure);
  assert.equal(completed, false);
});

test("stream observers suppress cancellation and report other Connect failures", async () => {
  for (const code of [Code.Canceled, Code.Unauthenticated]) {
    const failure = new ConnectError("Stopped", code);
    let received: unknown;
    let completed = false;
    await observeServerStream(Stream.fail(failure), {
      onError: (error) => {
        received = error;
      },
      onComplete: () => {
        completed = true;
      },
    });
    assert.equal(received, code === Code.Canceled ? undefined : failure);
    assert.equal(completed, false);
  }
});

test("metadata parsing preserves null and other false-like values through protobuf", () => {
  for (const value of [null, false, 0, "", { value: null, items: [null] }]) {
    const parsed = parseJsonValue(JSON.stringify(value));
    assert.ok(parsed !== undefined);
    assert.deepEqual(valueToJson(jsonToValue(parsed)), value);
  }
});

test("invalid metadata JSON cannot become a stored null", () => {
  for (const input of ["", "undefined", "{", "null trailing"]) {
    assert.equal(parseJsonValue(input), undefined);
  }
});

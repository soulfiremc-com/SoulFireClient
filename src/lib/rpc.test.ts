import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Code,
  ConnectError,
  createContextKey,
  createContextValues,
  createRouterTransport,
  type CallOptions,
} from "@connectrpc/connect";
import { Deferred, Effect, Fiber, Stream } from "effect";
import { LogsService } from "@/generated/soulfire/logs_pb";
import { createRpcClient, rpc, rpcStream, withSignal } from "./rpc";

test("generated unary clients preserve payloads, metadata, deadlines, and context", async () => {
  const key = createContextKey("default");
  let calls = 0;
  const received: string[] = [];
  const transport = createRouterTransport(
    (router) => {
      router.service(LogsService, {
        getPrevious(request, context) {
          calls++;
          assert.equal(request.count, 7);
          assert.equal(
            context.requestHeader.get("authorization"),
            "Bearer token",
          );
          assert.ok((context.timeoutMs() ?? 0) > 0);
          assert.ok((context.timeoutMs() ?? Infinity) <= 1_000);
          context.responseHeader.set("x-request-id", "request-1");
          context.responseTrailer.set("x-finished", "true");
          return { messages: [{ id: "log-1", message: "Started" }] };
        },
      });
    },
    {
      transport: {
        interceptors: [
          (next) => (request) => {
            assert.equal(request.contextValues.get(key), "custom");
            return next(request);
          },
        ],
      },
    },
  );
  const client = createRpcClient(LogsService, transport);
  const request = client.getPrevious(
    { count: 7 },
    {
      headers: { authorization: "Bearer token" },
      timeoutMs: 1_000,
      contextValues: createContextValues().set(key, "custom"),
      onHeader: (headers) => received.push(headers.get("x-request-id") ?? ""),
      onTrailer: (trailers) => received.push(trailers.get("x-finished") ?? ""),
    },
  );
  assert.equal(calls, 0);
  const response = await Effect.runPromise(request);
  assert.equal(response.messages[0].id, "log-1");
  assert.equal(response.messages[0].message, "Started");
  assert.deepEqual(received, ["request-1", "true"]);
  assert.equal(calls, 1);
});

test("Promise boundaries retain generated unary RPC errors", async () => {
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious() {
        throw new ConnectError("Expired token", Code.Unauthenticated, {
          "x-request-id": "request-1",
        });
      },
    });
  });
  await assert.rejects(
    Effect.runPromise(createRpcClient(LogsService, transport).getPrevious({})),
    (error: unknown) =>
      error instanceof ConnectError &&
      error.code === Code.Unauthenticated &&
      error.rawMessage === "Expired token" &&
      error.metadata.get("x-request-id") === "request-1",
  );
});

test("generated streams subscribe lazily and abort after finite consumption", async () => {
  const signals: AbortSignal[] = [];
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      async *subscribe(_, context) {
        signals.push(context.signal);
        yield { message: { id: String(signals.length), message: "Started" } };
        await new Promise<void>((resolve) => {
          if (context.signal.aborted) resolve();
          else
            context.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
        });
      },
    });
  });
  const stream = createRpcClient(LogsService, transport).subscribe({});
  assert.equal(signals.length, 0);
  for (const id of ["1", "2"]) {
    const response = await Effect.runPromise(
      stream.pipe(Stream.take(1), Stream.runCollect),
    );
    assert.equal(response[0].message?.id, id);
    assert.equal(signals[signals.length - 1]?.aborted, true);
  }
  assert.notEqual(signals[0], signals[1]);
});

test("caller cancellation stops a pending generated stream read", async () => {
  const started = Deferred.makeUnsafe<void>();
  let signal: AbortSignal | undefined;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      subscribe(_, context) {
        signal = context.signal;
        return {
          [Symbol.asyncIterator]: () => ({
            next: async () => {
              Deferred.doneUnsafe(started, Effect.void);
              await new Promise<void>((resolve) => {
                if (context.signal.aborted) resolve();
                else
                  context.signal.addEventListener("abort", () => resolve(), {
                    once: true,
                  });
              });
              return { done: true, value: undefined };
            },
          }),
        };
      },
    });
  });
  const controller = new AbortController();
  const result = Effect.runPromise(
    Effect.result(
      createRpcClient(LogsService, transport)
        .subscribe({}, { signal: controller.signal })
        .pipe(Stream.runDrain),
    ),
  );
  await Effect.runPromise(Deferred.await(started));
  controller.abort();
  const exit = await result;
  assert.equal(exit._tag, "Failure");
  if (exit._tag === "Failure") assert.equal(exit.failure.code, Code.Canceled);
  assert.equal(signal?.aborted, true);
});

test("unary calls are lazy and run afresh on each execution", async () => {
  let calls = 0;
  const request = rpc("Test.Get", async () => ++calls);
  assert.equal(calls, 0);
  assert.equal(await Effect.runPromise(request), 1);
  assert.equal(await Effect.runPromise(request), 2);
});

test("unary failures preserve Connect codes, metadata, and error identity", async () => {
  const error = new ConnectError("Expired token", Code.Unauthenticated, {
    "x-request-id": "request-1",
  });
  const result = await Effect.runPromise(
    Effect.result(
      rpc("Test.Get", async () => {
        throw error;
      }),
    ),
  );
  assert.equal(result._tag, "Failure");
  if (result._tag === "Failure") assert.equal(result.failure, error);
});

test("interrupting a unary call aborts the transport signal", async () => {
  const started = Deferred.makeUnsafe<void>();
  let aborted = false;
  const fiber = Effect.runFork(
    rpc(
      "Test.Get",
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve();
            },
            { once: true },
          );
          Deferred.doneUnsafe(started, Effect.void);
        }),
    ),
  );
  await Effect.runPromise(Deferred.await(started));
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.equal(aborted, true);
});

test("streams are lazy and every consumer gets a fresh subscription", async () => {
  const signals: AbortSignal[] = [];
  let closed = 0;
  const stream = rpcStream("Test.Watch", (signal) => {
    signals.push(signal);
    return (async function* () {
      try {
        yield 1;
        yield 2;
      } finally {
        closed++;
      }
    })();
  });
  assert.equal(signals.length, 0);
  assert.deepEqual(
    await Effect.runPromise(stream.pipe(Stream.take(1), Stream.runCollect)),
    [1],
  );
  assert.equal(signals[0].aborted, true);
  assert.deepEqual(await Effect.runPromise(Stream.runCollect(stream)), [1, 2]);
  assert.equal(signals[1].aborted, true);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(closed, 2);
});

test("interrupting a pending stream read aborts before returning its iterator", async () => {
  const started = Deferred.makeUnsafe<void>();
  const events: string[] = [];
  const stream = rpcStream<number>("Test.Watch", (signal) => ({
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<number>>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              events.push("abort");
              resolve({ done: true, value: undefined });
            },
            { once: true },
          );
          Deferred.doneUnsafe(started, Effect.void);
        }),
      return: async () => {
        events.push("return");
        return { done: true, value: undefined };
      },
    }),
  }));
  const fiber = Effect.runFork(Stream.runDrain(stream));
  await Effect.runPromise(Deferred.await(started));
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.deepEqual(events, ["abort", "return"]);
});

test("stream acquisition failures use the typed Connect error channel", async () => {
  const cause = new Error("Subscription failed");
  const result = await Effect.runPromise(
    Effect.result(
      Stream.runDrain(
        rpcStream("Test.Watch", () => {
          throw cause;
        }),
      ),
    ),
  );
  assert.equal(result._tag, "Failure");
  if (result._tag === "Failure") {
    assert.ok(result.failure instanceof ConnectError);
    assert.equal(result.failure.code, Code.Unknown);
    assert.equal(result.failure.cause, cause);
  }
});

test("stream read failures survive cleanup failures and release the subscription", async () => {
  const error = new ConnectError("Disconnected", Code.Unavailable);
  let signal: AbortSignal | undefined;
  let returned = false;
  const result = await Effect.runPromise(
    Effect.result(
      Stream.runDrain(
        rpcStream<number>("Test.Watch", (subscriptionSignal) => {
          signal = subscriptionSignal;
          return {
            [Symbol.asyncIterator]: () => ({
              next: async () => {
                throw error;
              },
              return: async () => {
                returned = true;
                throw new Error("Cleanup failed");
              },
            }),
          };
        }),
      ),
    ),
  );
  assert.equal(result._tag, "Failure");
  if (result._tag === "Failure") assert.equal(result.failure, error);
  assert.equal(signal?.aborted, true);
  assert.equal(returned, true);
});

test("streams without iterator.return still abort when the consumer finishes", async () => {
  let signal: AbortSignal | undefined;
  await Effect.runPromise(
    rpcStream<number>("Test.Watch", (subscriptionSignal) => {
      signal = subscriptionSignal;
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 1 }),
        }),
      };
    }).pipe(Stream.take(1), Stream.runDrain),
  );
  assert.equal(signal?.aborted, true);
});

test("signal composition preserves call options and cancellation from either owner", () => {
  for (const owner of ["caller", "effect"] as const) {
    const caller = new AbortController();
    const effect = new AbortController();
    const headers = new Headers({ Authorization: "Bearer token" });
    const onHeader = () => {};
    const options: CallOptions = {
      signal: caller.signal,
      timeoutMs: 1_000,
      headers,
      onHeader,
    };
    const composed = withSignal(options, effect.signal);
    assert.equal(composed.signal?.aborted, false);
    assert.equal(composed.timeoutMs, 1_000);
    assert.equal(composed.headers, headers);
    assert.equal(composed.onHeader, onHeader);
    assert.equal(options.signal, caller.signal);
    (owner === "caller" ? caller : effect).abort();
    assert.equal(composed.signal?.aborted, true);
  }
  const controller = new AbortController();
  assert.equal(
    withSignal(undefined, controller.signal).signal,
    controller.signal,
  );
  controller.abort();
  assert.equal(
    withSignal({ signal: controller.signal }, new AbortController().signal)
      .signal?.aborted,
    true,
  );
});

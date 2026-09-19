import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { create } from "@bufbuild/protobuf";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import {
  LogScopeSchema,
  LogStringSchema,
  LogsService,
} from "@soulfiremc/sdk/generated/soulfire/logs_pb";
import {
  createTerminalLogSession,
  getTerminalLogSession,
  mergeTerminalLines,
  toTerminalLine,
} from "./terminal-log-store";

const scope = () =>
  create(LogScopeSchema, { scope: { case: "global", value: {} } });
const message = (id: number) =>
  create(LogStringSchema, { id: String(id), message: String(id) });

test("history merges with live messages by ID and retains a bounded buffer", () => {
  const current = [2, 3].map((id) => toTerminalLine(message(id)));
  const merged = mergeTerminalLines(
    current,
    [1, 2].map((id) => toTerminalLine(message(id))),
    true,
  );
  assert.deepEqual(
    merged.map((entry) => Number(entry.id)),
    [1, 2, 3],
  );
  assert.equal(merged[1], current[0]);
  assert.equal(
    mergeTerminalLines(current, [toTerminalLine(message(3))]),
    current,
  );
  const many = Array.from({ length: 600 }, (_, id) =>
    toTerminalLine(message(id)),
  );
  const bounded = mergeTerminalLines([], many);
  assert.equal(bounded.length, 500);
  assert.equal(Number(bounded[0].id), 100);
  assert.equal(Number(bounded[499].id), 599);
});

test("same connection and scope share one stream until the last consumer leaves", async () => {
  let subscriptions = 0;
  let cancellations = 0;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages: [message(1)] }),
      async *subscribe(_, context) {
        subscriptions++;
        yield { message: message(2) };
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              cancellations++;
              resolve();
            },
            { once: true },
          );
        });
      },
    });
  });
  const first = getTerminalLogSession(transport, scope());
  const second = getTerminalLogSession(transport, scope());
  assert.equal(first, second);
  const stopFirst = first.retain();
  const stopSecond = second.retain();
  try {
    await delay(90);
    assert.equal(subscriptions, 1);
    assert.deepEqual(
      first.lines.get().map((entry) => Number(entry.id)),
      [1, 2],
    );
    stopFirst();
    assert.equal(cancellations, 0);
    stopSecond();
    await delay(10);
    assert.equal(cancellations, 1);
    assert.equal(getTerminalLogSession(transport, scope()), first);
    stopFirst();
    assert.equal(first.active, false);
  } finally {
    stopFirst();
    stopSecond();
  }
});

test("batches stream updates and rejects history that completes after disposal", async () => {
  let finishHistory: (() => void) | undefined;
  const historyReady = new Promise<void>((resolve) => {
    finishHistory = resolve;
  });
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      async getPrevious() {
        await historyReady;
        return { messages: [message(0)] };
      },
      async *subscribe(_, context) {
        for (let id = 1; id <= 10; id++) yield { message: message(id) };
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
      },
    });
  });
  const session = createTerminalLogSession(
    createClient(LogsService, transport),
    scope(),
  );
  let updates = 0;
  const subscription = session.state.subscribe(() => updates++);
  const stop = session.retain();
  try {
    await delay(90);
    assert.equal(updates, 1);
    assert.equal(session.lines.get().length, 10);
    stop();
    finishHistory?.();
    await delay(10);
    assert.equal(session.state.get().historyLoaded, false);
    assert.equal(session.lines.get().length, 10);
  } finally {
    stop();
    finishHistory?.();
    subscription.unsubscribe();
  }
});

test("streams reconnect after completion and stop retrying when released", async () => {
  let subscriptions = 0;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages: [] }),
      async *subscribe() {
        subscriptions++;
        yield { message: message(subscriptions) };
      },
    });
  });
  const session = createTerminalLogSession(
    createClient(LogsService, transport),
    scope(),
  );
  const stop = session.retain();
  try {
    await delay(1150);
    assert.equal(subscriptions, 2);
    stop();
    await delay(1100);
    assert.equal(subscriptions, 2);
  } finally {
    stop();
  }
});

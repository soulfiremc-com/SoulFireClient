import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { createRpcClient } from "@/lib/rpc";
import {
  LogScopeSchema,
  LogStringSchema,
  LogsService,
} from "@/generated/soulfire/logs_pb";
import {
  createTerminalLogSession,
  getTerminalLogSession,
  mergeTerminalLines,
  toTerminalLine,
} from "./terminal-log-store";

const scope = () =>
  create(LogScopeSchema, { scope: { case: "global", value: {} } });
const message = (id: number) =>
  create(LogStringSchema, {
    id: String(id),
    message: String(id),
    timestamp: { seconds: BigInt(id), nanos: 0 },
  });

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
  assert.equal(Number(bounded[0]?.id), 100);
  assert.equal(Number(bounded[499]?.id), 599);
});

test("multiline messages retain the newest lines across buffer boundaries", () => {
  const large = toTerminalLine({
    ...message(1),
    message: Array.from({ length: 600 }, (_, line) => String(line)).join("\n"),
  });
  const bounded = mergeTerminalLines([toTerminalLine(message(0))], [large]);
  assert.equal(bounded.length, 1);
  assert.equal(bounded[0]?.id, large.id);
  assert.equal(bounded[0].lines, 500);
  assert.deepEqual(
    bounded[0].message.split("\n").map(Number),
    Array.from({ length: 500 }, (_, line) => line + 100),
  );
  assert.equal(mergeTerminalLines(bounded, [large]), bounded);

  // Small overflows keep the oldest entry, so the view can append in place.
  const latest = toTerminalLine(message(2));
  const appended = mergeTerminalLines(bounded, [latest]);
  assert.deepEqual(appended, [bounded[0], latest]);

  const overflow = Array.from({ length: 50 }, (_, id) =>
    toTerminalLine(message(id + 3)),
  );
  const updated = mergeTerminalLines(appended, overflow);
  assert.equal(updated.length, 52);
  assert.equal(updated[0]?.lines, 449);
  assert.equal(Number(updated[0].message.split("\n")[0]), 151);
  assert.equal(updated[1], latest);
  assert.equal(
    updated.reduce((total, entry) => total + entry.lines, 0),
    500,
  );
});

test("the buffer trims only after it overflows by a batch of lines", () => {
  let entries: ReturnType<typeof toTerminalLine>[] = [];
  let trims = 0;
  for (let id = 0; id < 700; id++) {
    const next = mergeTerminalLines(entries, [toTerminalLine(message(id))]);
    if (next[0] !== entries[0] && entries.length > 0) trims++;
    entries = next;
  }
  assert.ok(entries.length <= 550);
  assert.equal(entries.at(-1)?.id, "699");
  assert.ok(trims <= 4, `expected few trims, got ${trims}`);
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
      first.state.get().entries.map((entry) => Number(entry.id)),
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
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            {
              once: true,
            },
          );
        });
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  let updates = 0;
  const subscription = session.state.subscribe(() => {
    updates++;
  });
  const stop = session.retain();
  try {
    await delay(90);
    assert.equal(updates, 1);
    assert.equal(session.state.get().entries.length, 10);
    stop();
    finishHistory?.();
    await delay(10);
    assert.equal(session.state.get().historyLoaded, false);
    assert.equal(session.state.get().entries.length, 10);
  } finally {
    stop();
    finishHistory?.();
    subscription.unsubscribe();
  }
});

test("restarted sessions reject an older snapshot that ignored cancellation", async () => {
  let finishOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    finishOld = resolve;
  });
  let requests = 0;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      async getPrevious() {
        if (++requests === 1) {
          await oldGate;
          return { messages: [message(0)] };
        }
        return { messages: [message(20)] };
      },
      async *subscribe(_, context) {
        yield { message: message(10) };
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            {
              once: true,
            },
          );
        });
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  const stopOld = session.retain();
  await delay(10);
  stopOld();
  const stopNew = session.retain();
  try {
    await delay(90);
    finishOld();
    await delay(10);
    assert.deepEqual(
      session.state.get().entries.map((entry) => Number(entry.id)),
      [10, 20],
    );
    assert.equal(session.state.get().historyLoaded, true);
  } finally {
    finishOld();
    stopOld();
    stopNew();
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
    createRpcClient(LogsService, transport),
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

test("a newer history window keeps older cached logs ordered before trimming", () => {
  const previous = Array.from({ length: 500 }, (_, id) =>
    toTerminalLine(message(id)),
  );
  const history = Array.from({ length: 360 }, (_, id) =>
    toTerminalLine(message(id + 201)),
  );
  const merged = mergeTerminalLines(previous, history, true);
  assert.deepEqual(
    merged.map((entry) => Number(entry.id)),
    Array.from({ length: 500 }, (_, id) => id + 61),
  );
  assert.equal(merged[0], previous[61]);
});

const logEntry = (sequence: number) =>
  toTerminalLine({ ...message(1), id: `1000-${sequence}` });

test("logs in the same millisecond use their numeric sequence for ordering", () => {
  const merged = mergeTerminalLines(
    [logEntry(9)],
    [logEntry(10), logEntry(11)],
    true,
  );
  assert.deepEqual(
    merged.map((mergedEntry) => Number(mergedEntry.id.split("-")[1])),
    [9, 10, 11],
  );
});

test("reconnecting catches up retained history without duplicating live entries", async () => {
  let subscriptions = 0;
  let history = [message(1)];
  let endFirst!: () => void;
  const firstEnded = new Promise<void>((resolve) => {
    endFirst = resolve;
  });
  let ready!: () => void;
  const secondStarted = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages: history }),
      async *subscribe(_, context) {
        if (++subscriptions === 1) {
          yield { message: message(1) };
          await firstEnded;
          return;
        }
        history = [message(1), message(2), message(3)];
        yield { message: message(3) };
        ready();
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            {
              once: true,
            },
          );
        });
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  const stop = session.retain();
  try {
    await delay(90);
    history = [message(1), message(2)];
    endFirst();
    await Promise.race([
      secondStarted,
      delay(2500).then(() => {
        throw new Error("Log subscription did not reconnect");
      }),
    ]);
    await delay(90);
    assert.deepEqual(
      session.state.get().entries.map((entry) => Number(entry.id)),
      [1, 2, 3],
    );
  } finally {
    endFirst();
    stop();
  }
});

test("the first live response queues catch-up behind an in-flight snapshot", async () => {
  let finishSnapshot!: () => void;
  const snapshotGate = new Promise<void>((resolve) => {
    finishSnapshot = resolve;
  });
  let snapshotStarted!: () => void;
  const snapshotReady = new Promise<void>((resolve) => {
    snapshotStarted = resolve;
  });
  let requests = 0;
  let active = 0;
  let peak = 0;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      async getPrevious() {
        peak = Math.max(peak, ++active);
        const initial = ++requests === 1;
        if (initial) {
          snapshotStarted();
          await snapshotGate;
        }
        active--;
        return {
          messages: initial
            ? [message(1)]
            : [message(1), message(2), message(3)],
        };
      },
      async *subscribe(_, context) {
        await snapshotReady;
        yield { message: message(3) };
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            {
              once: true,
            },
          );
        });
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  const stop = session.retain();
  try {
    await delay(90);
    assert.deepEqual(
      session.state.get().entries.map((entry) => Number(entry.id)),
      [3],
    );
    finishSnapshot();
    await delay(90);
    assert.deepEqual(
      session.state.get().entries.map((entry) => Number(entry.id)),
      [1, 2, 3],
    );
    assert.equal(peak, 1);
    assert.equal(requests, 2);
  } finally {
    finishSnapshot();
    stop();
  }
});

test("releasing one scope stops its own stream and leaves other scopes open", async () => {
  const open = new Set<string>();
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages: [] }),
      async *subscribe(request, context) {
        const key = request.scope?.scope.case ?? "";
        open.add(key);
        yield { message: message(1) };
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true },
          );
        });
        open.delete(key);
      },
    });
  });
  const global = getTerminalLogSession(transport, scope());
  const personal = getTerminalLogSession(
    transport,
    create(LogScopeSchema, { scope: { case: "personal", value: {} } }),
  );
  const releaseGlobal = global.retain();
  const releasePersonal = personal.retain();
  try {
    await delay(90);
    assert.deepEqual([...open].toSorted(), ["global", "personal"]);
    releaseGlobal();
    await delay(10);
    assert.deepEqual([...open], ["personal"]);
    releasePersonal();
    await delay(10);
    assert.deepEqual([...open], []);
  } finally {
    releaseGlobal();
    releasePersonal();
  }
});

const connected = (id: number, botAccountName: string) =>
  create(LogStringSchema, {
    id: String(id),
    message: "Connected to server",
    botAccountName,
    timestamp: { seconds: BigInt(id), nanos: 0 },
  });

test("repeated message text from different sources stays visible", async () => {
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({
        messages: [connected(1, "A"), connected(2, "B"), connected(3, "C")],
      }),
      async *subscribe(_, context) {
        yield { message: connected(4, "D") };
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true },
          );
        });
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  const stop = session.retain();
  try {
    await delay(90);
    assert.deepEqual(
      session.state.get().entries.map((entry) => entry.botAccountName),
      ["A", "B", "C", "D"],
    );
  } finally {
    stop();
  }
});

test("a refused scope stops retrying until the session is retained again", async () => {
  let historyCalls = 0;
  let subscribeCalls = 0;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => {
        historyCalls++;
        throw new ConnectError("denied", Code.PermissionDenied);
      },
      // oxlint-disable-next-line require-yield -- the server refuses before it sends a message
      async *subscribe() {
        subscribeCalls++;
        throw new ConnectError("denied", Code.PermissionDenied);
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  const release = session.retain();
  try {
    await delay(100);
    assert.equal(session.state.get().denied, true);
    assert.equal(session.state.get().historyLoaded, true);
    const calls = historyCalls + subscribeCalls;
    // A retry would start after about three seconds; none may start at all.
    await delay(3200);
    assert.equal(historyCalls + subscribeCalls, calls);
  } finally {
    release();
  }
  const again = session.retain();
  try {
    await delay(100);
    assert.ok(subscribeCalls >= 2, "retaining again must retry");
    assert.equal(session.state.get().denied, true);
  } finally {
    again();
  }
});

test("a refused scope drops the logs it cached while access was allowed", async () => {
  let allowed = true;
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => {
        if (!allowed) throw new ConnectError("denied", Code.PermissionDenied);
        return { messages: [message(1), message(2)] };
      },
      // oxlint-disable-next-line require-yield -- the stream only reports refusal
      async *subscribe() {
        if (!allowed) throw new ConnectError("denied", Code.PermissionDenied);
        await delay(10_000);
      },
    });
  });
  const session = createTerminalLogSession(
    createRpcClient(LogsService, transport),
    scope(),
  );
  const release = session.retain();
  await delay(100);
  assert.deepEqual(
    session.state.get().entries.map((entry) => entry.id),
    ["1", "2"],
  );
  release();
  allowed = false;
  const again = session.retain();
  try {
    await delay(100);
    assert.equal(session.state.get().denied, true);
    assert.deepEqual(session.state.get().entries, []);
  } finally {
    again();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { jest } from "bun:test";
import { create } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createRouterTransport,
  type Transport,
} from "@connectrpc/connect";
import { AtomRegistry } from "effect/reactivity";
import {
  type LogScope,
  LogScopeSchema,
  LogStringSchema,
  LogsService,
} from "@/generated/soulfire/logs_pb";
import {
  mergeTerminalLines,
  terminalLogAtoms,
  toTerminalLine,
} from "./terminal-log-store";

const scope = () =>
  create(LogScopeSchema, { scope: { case: "global", value: {} } });
/** Opens a view of the logs of a scope, like a mounted terminal. */
function open(
  transport: Transport,
  logScope: LogScope = scope(),
  registry = AtomRegistry.make(),
) {
  const atoms = terminalLogAtoms(transport, logScope);
  const state = () => registry.get(atoms.state);
  return {
    atoms,
    registry,
    state,
    ids: () => state().entries.map((entry) => Number(entry.id)),
    close: registry.mount(atoms.session),
  };
}
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

test("views of one connection and scope share a stream that stops with the last view", async () => {
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
  const first = open(transport);
  const second = open(transport, scope(), first.registry);
  assert.equal(first.atoms.state, second.atoms.state);
  try {
    await delay(90);
    assert.equal(subscriptions, 1);
    assert.deepEqual(first.ids(), [1, 2]);
    first.close();
    await delay(10);
    assert.equal(cancellations, 0);
    second.close();
    await delay(10);
    assert.equal(cancellations, 1);
    // The closed scope keeps its logs for the next view.
    assert.deepEqual(open(transport, scope(), first.registry).ids(), [1, 2]);
  } finally {
    first.close();
    second.close();
  }
});

test("closed views keep cached logs for five minutes", async () => {
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages: [message(1)] }),
      // oxlint-disable-next-line require-yield -- history is enough for this test
      async *subscribe(_, context) {
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
  const view = open(transport);
  await delay(50);
  assert.deepEqual(view.ids(), [1]);
  jest.useFakeTimers();
  try {
    view.close();
    // Let the registry remove the session and start the idle timer.
    for (let step = 0; step < 3; step++) {
      jest.advanceTimersByTime(0);
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    // Reading the logs would restart the idle timer, so look at the cache.
    const cached = () => view.registry.getNodes().has(view.atoms.state);
    jest.advanceTimersByTime(5 * 60_000 - 1000);
    assert.equal(cached(), true);
    jest.advanceTimersByTime(2000);
    assert.equal(cached(), false);
    assert.deepEqual(view.ids(), []);
  } finally {
    jest.useRealTimers();
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
  const view = open(transport);
  let updates = 0;
  const unsubscribe = view.registry.subscribe(view.atoms.state, () => {
    updates++;
  });
  try {
    await delay(90);
    assert.equal(updates, 1);
    assert.equal(view.state().entries.length, 10);
    view.close();
    await delay(10);
    finishHistory?.();
    await delay(10);
    assert.equal(view.state().historyLoaded, false);
    assert.equal(view.state().entries.length, 10);
  } finally {
    view.close();
    finishHistory?.();
    unsubscribe();
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
  const old = open(transport);
  await delay(10);
  old.close();
  await delay(10);
  const view = open(transport, scope(), old.registry);
  try {
    await delay(90);
    finishOld();
    await delay(10);
    assert.deepEqual(view.ids(), [10, 20]);
    assert.equal(view.state().historyLoaded, true);
  } finally {
    finishOld();
    view.close();
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
  const view = open(transport);
  try {
    await delay(1150);
    assert.equal(subscriptions, 2);
    view.close();
    await delay(1100);
    assert.equal(subscriptions, 2);
  } finally {
    view.close();
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
  const view = open(transport);
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
    assert.deepEqual(view.ids(), [1, 2, 3]);
  } finally {
    endFirst();
    view.close();
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
  const view = open(transport);
  try {
    await delay(90);
    assert.deepEqual(view.ids(), [3]);
    finishSnapshot();
    await delay(90);
    assert.deepEqual(view.ids(), [1, 2, 3]);
    assert.equal(peak, 1);
    assert.equal(requests, 2);
  } finally {
    finishSnapshot();
    view.close();
  }
});

test("releasing one scope stops its own stream and leaves other scopes open", async () => {
  const streams = new Set<string>();
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages: [] }),
      async *subscribe(request, context) {
        const key = request.scope?.scope.case ?? "";
        streams.add(key);
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
        streams.delete(key);
      },
    });
  });
  const global = open(transport);
  const personal = open(
    transport,
    create(LogScopeSchema, { scope: { case: "personal", value: {} } }),
    global.registry,
  );
  try {
    await delay(90);
    assert.deepEqual([...streams].toSorted(), ["global", "personal"]);
    global.close();
    await delay(10);
    assert.deepEqual([...streams], ["personal"]);
    personal.close();
    await delay(10);
    assert.deepEqual([...streams], []);
  } finally {
    global.close();
    personal.close();
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
  const view = open(transport);
  try {
    await delay(90);
    assert.deepEqual(
      view.state().entries.map((entry) => entry.botAccountName),
      ["A", "B", "C", "D"],
    );
  } finally {
    view.close();
  }
});

test("a refused scope stops retrying until a view opens it again", async () => {
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
  const view = open(transport);
  try {
    await delay(100);
    assert.equal(view.state().denied, true);
    assert.equal(view.state().historyLoaded, true);
    const calls = historyCalls + subscribeCalls;
    // A retry would start after about three seconds; none may start at all.
    await delay(3200);
    assert.equal(historyCalls + subscribeCalls, calls);
  } finally {
    view.close();
  }
  await delay(10);
  const again = open(transport, scope(), view.registry);
  try {
    await delay(100);
    assert.ok(subscribeCalls >= 2, "opening again must retry");
    assert.equal(again.state().denied, true);
  } finally {
    again.close();
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
  const view = open(transport);
  await delay(100);
  assert.deepEqual(view.ids(), [1, 2]);
  view.close();
  allowed = false;
  await delay(10);
  const again = open(transport, scope(), view.registry);
  try {
    await delay(100);
    assert.equal(again.state().denied, true);
    assert.deepEqual(again.state().entries, []);
  } finally {
    again.close();
  }
});

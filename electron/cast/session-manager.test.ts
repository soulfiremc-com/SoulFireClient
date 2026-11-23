import { randomUUID } from "node:crypto";
/// <reference types="bun" />
import { afterEach, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  MAX_PAYLOAD_BYTES,
  payloadBytes,
  type CastDevice,
  type CastState,
  type MetricsSnapshot,
  type SenderMessage,
} from "@soulfiremc/cast-protocol";
import { Clock, Deferred, Effect, Exit, Layer, Scope } from "effect";
import { TestClock } from "effect/testing";
import { CastDiscovery, CastDiscoveryError } from "./discovery";
import { castError, type CastError } from "./errors";
import { MetricsSource, type MetricsFrame } from "./metrics-source";
import { CastSessionManager } from "./session-manager";
import { CastTransport } from "./transport";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});
const device: CastDevice = {
  id: "tv",
  address: "192.0.2.1",
  port: 8009,
  name: "TV",
};
const source = {
  address: "http://localhost:38765",
  token: "test-credential",
  instanceId: "instance",
};
function sample(timestamp: number): MetricsSnapshot {
  return {
    timestamp,
    botsOnline: 2,
    botsTotal: 3,
    packetsSentPerSecond: 5,
    packetsReceivedPerSecond: 6,
    bytesSentPerSecond: 7,
    bytesReceivedPerSecond: 8,
    avgTickDurationMs: 1,
    maxTickDurationMs: 2,
    avgHealth: 20,
    avgFoodLevel: 20,
    totalLoadedChunks: 10,
    totalTrackedEntities: 2,
    connections: 1,
    disconnections: 0,
  };
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 1000;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error("Effect did not reach the expected state");
    await Bun.sleep(1);
  }
}
async function fixture(
  options: {
    hang?: boolean;
    reject?: boolean;
    history?: number;
    deferSettings?: boolean;
    holdSettings?: boolean;
  } = {},
) {
  const scope = Scope.makeUnsafe();
  const clock = await Effect.runPromise(
    TestClock.make().pipe(Effect.provideService(Scope.Scope, scope)),
  );
  const states: CastState[] = [];
  const channels: {
    messages: SenderMessage[];
    relaunch: boolean;
    closed: boolean;
    fail?: ((error: CastError) => void) | undefined;
  }[] = [];
  let feedsClosed = 0;
  let metricsError: CastError | undefined;
  const settingsGate = Deferred.makeUnsafe<undefined>();
  let deferSettings = options.deferSettings;
  const frame: MetricsFrame = {
    snapshots: Array.from({ length: options.history ?? 1 }, (_, i) =>
      sample(i * 3000),
    ),
    distributions: {
      healthHistogram: [],
      foodHistogram: [],
      dimensionCounts: {},
      gameModeCounts: {},
      botPositions: [],
    },
    instanceInfo: { name: "Instance", onlineBots: 2, desiredBots: 3 },
  };
  const transport = Layer.succeed(CastTransport, {
    open: (_device, relaunch) =>
      Effect.gen(function* () {
        const entry = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const record = {
              messages: [] as SenderMessage[],
              relaunch,
              closed: false,
              fail: undefined as ((error: CastError) => void) | undefined,
            };
            channels.push(record);
            return record;
          }),
          (candidate) =>
            Effect.sync(() => {
              candidate.closed = true;
            }),
        );
        if (options.reject)
          return yield* castError("incompatible receiver", false);
        if (options.hang) return yield* Effect.never;
        return {
          sessionId: randomUUID(),
          onFailure: (callback) => {
            entry.fail = callback;
            return () => {};
          },
          send: (message) =>
            Effect.gen(function* () {
              entry.messages.push(message);
              if (options.holdSettings && message.type === "SETTINGS")
                return yield* Effect.never;
              if (deferSettings && message.type === "SETTINGS") {
                deferSettings = false;
                yield* Deferred.await(settingsGate);
              }
              return message.type === "PING"
                ? {
                    type: "STATUS" as const,
                    requestId: message.requestId,
                    sessionId: message.sessionId,
                    visibility: "visible" as const,
                    lastSequence: 0,
                    metricsAt: frame.snapshots.at(-1)?.timestamp ?? 0,
                    receivedAt: 1,
                  }
                : {
                    type: "ACK" as const,
                    requestId: message.requestId,
                    sessionId: message.sessionId,
                  };
            }),
        };
      }),
  });
  const browses: {
    up: (device: CastDevice) => void;
    down: (id: string) => void;
    failure: Deferred.Deferred<never, CastDiscoveryError>;
  }[] = [];
  const discovery = Layer.succeed(CastDiscovery, {
    browse: (handlers) =>
      Effect.suspend(() => {
        const failure = Deferred.makeUnsafe<never, CastDiscoveryError>();
        browses.push({ ...handlers, failure });
        return Deferred.await(failure);
      }),
  });
  const metrics = Layer.succeed(MetricsSource, {
    open: () =>
      Effect.acquireRelease(
        Effect.succeed({
          read: Effect.suspend(() =>
            metricsError ? Effect.fail(metricsError) : Effect.succeed(frame),
          ),
        }),
        () =>
          Effect.sync(() => {
            feedsClosed++;
          }),
      ),
  });
  const manager = new CastSessionManager(
    (state) => {
      states.push(state);
    },
    Layer.mergeAll(
      discovery,
      transport,
      metrics,
      Layer.succeed(Clock.Clock, clock),
    ),
  );
  disposers.push(async () => {
    await manager.dispose();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
  return {
    manager,
    clock,
    channels,
    browses,
    channel: (index: number) => {
      const channel = channels[index];
      if (!channel) throw new Error(`Channel ${index} was not opened`);
      return channel;
    },
    device: (index: number) => {
      const state = manager.getState().devices[index];
      if (!state) throw new Error(`Device ${index} is not tracked`);
      return state;
    },
    states,
    frame,
    feedsClosed: () => feedsClosed,
    releaseSettings: () =>
      Effect.runSync(Deferred.succeed(settingsGate, undefined)),
    setMetricsError: (error: CastError | undefined) => {
      metricsError = error;
    },
  };
}

test("a session sends settings and bounded history, then releases all resources on stop", async () => {
  const f = await fixture({ history: 600 });
  await f.manager.connect(device, source);
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "PING"),
  );
  const frames = f
    .channel(0)
    .messages.filter((message) => message.type === "METRICS");
  expect(frames).toHaveLength(30);
  expect(frames.flatMap((message) => message.snapshots)).toEqual([
    ...f.frame.snapshots,
  ]);
  expect(frames.filter((message) => message.reset)).toHaveLength(1);
  expect(
    frames.every((message) => payloadBytes(message) <= MAX_PAYLOAD_BYTES),
  ).toBe(true);
  expect(f.device(0).visibility).toBe("visible");
  await f.manager.stop(device.id);
  expect(f.channel(0).closed).toBe(true);
  expect(f.channel(0).messages.at(-1)?.type).toBe("RELEASE");
  expect(f.feedsClosed()).toBe(1);
  expect(f.device(0).phase).toBe("idle");
});

test("unchanged snapshots are not sent twice; settings changes are delivered", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "PING"),
  );
  f.manager.setSettings({ ...DEFAULT_SETTINGS, scale: "large" });
  await Effect.runPromise(f.clock.adjust("3 seconds"));
  await until(
    () =>
      f.channel(0).messages.filter((message) => message.type === "PING")
        .length === 2,
  );
  expect(
    f.channel(0).messages.filter((message) => message.type === "METRICS"),
  ).toHaveLength(1);
  const settings = f
    .channel(0)
    .messages.filter((message) => message.type === "SETTINGS");
  expect(settings.at(-1)?.settings.scale).toBe("large");
});

test("replacing a session closes the old scope and ignores its late failure", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  await f.manager.connect(device, source, true);
  expect(f.channels).toHaveLength(2);
  expect(f.channel(0).closed).toBe(true);
  expect(f.channel(1).relaunch).toBe(true);
  f.channel(0).fail?.(castError("late disconnect"));
  await Bun.sleep(1);
  expect(f.device(0).phase).toBe("ready");
  expect(f.channel(1).closed).toBe(false);
});

test("stop cancels a pending connection and rejects the initiating request", async () => {
  const f = await fixture({ hang: true });
  const result = f.manager.connect(device, source).then(
    () => null,
    (error: unknown) => error,
  );
  await until(() => f.channels.length === 1);
  await f.manager.stop(device.id);
  expect(await result).toBeInstanceOf(Error);
  expect(f.channel(0).closed).toBe(true);
  expect(f.feedsClosed()).toBe(1);
  expect(f.device(0).phase).toBe("idle");
});

test("permanent errors fail immediately and release partially acquired resources", async () => {
  const f = await fixture({ reject: true });
  // Bun types `rejects` matchers as void, but they return a promise at runtime.
  // oxlint-disable-next-line typescript/await-thenable, typescript/no-confusing-void-expression
  await expect(f.manager.connect(device, source)).rejects.toBeInstanceOf(Error);
  expect(f.channels).toHaveLength(1);
  expect(f.channel(0).closed).toBe(true);
  expect(f.device(0).phase).toBe("failed");
  expect(f.feedsClosed()).toBe(1);
});

test("transient metrics failure preserves the receiver and resumes without duplicate history", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "PING"),
  );
  f.setMetricsError(castError("server unavailable"));
  await Effect.runPromise(f.clock.adjust("3 seconds"));
  await until(() => Boolean(f.device(0).error));
  expect(f.channels).toHaveLength(1);
  expect(f.channel(0).closed).toBe(false);
  f.setMetricsError(undefined);
  await Effect.runPromise(f.clock.adjust("3 seconds"));
  await until(() => f.device(0).error === null);
  expect(
    f.channel(0).messages.filter((message) => message.type === "METRICS"),
  ).toHaveLength(1);
});

test("transport failure reconnects with backoff and restores history", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "PING"),
  );
  f.channel(0).fail?.(castError("connection lost"));
  await until(() => f.channel(0).closed);
  await Effect.runPromise(f.clock.adjust("1 second"));
  await until(
    () =>
      f.channels.length === 2 &&
      f.channel(1).messages.some((message) => message.type === "METRICS"),
  );
  expect(f.device(0).phase).toBe("ready");
  expect(
    f.channel(1).messages.find((message) => message.type === "METRICS")?.reset,
  ).toBe(true);
});

test("each successful reconnect restores the full retry budget", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  for (let drop = 0; drop < 7; drop++) {
    await until(() =>
      f.channel(drop).messages.some((message) => message.type === "PING"),
    );
    f.channel(drop).fail?.(castError("connection lost"));
    await until(() => f.channel(drop).closed);
    // The first retry waits one second again after every successful session.
    await Effect.runPromise(f.clock.adjust("1 second"));
    await until(() => f.channels.length === drop + 2);
  }
  await until(() => f.device(0).phase === "ready");
  expect(f.channels).toHaveLength(8);
});

test("a receiver that fails before its first status reply uses up the retry budget", async () => {
  const f = await fixture({ holdSettings: true });
  await f.manager.connect(device, source);
  for (let drop = 0; drop < 6; drop++) {
    await until(() =>
      f.channel(drop).messages.some((message) => message.type === "SETTINGS"),
    );
    f.channel(drop).fail?.(castError("receiver closed"));
    await until(() => f.channel(drop).closed);
    if (drop < 5) {
      await Effect.runPromise(f.clock.adjust(`${2 ** drop} seconds`));
      await until(() => f.channels.length === drop + 2);
    }
  }
  await until(() => f.device(0).phase === "failed");
  await Effect.runPromise(f.clock.adjust("60 seconds"));
  expect(f.channels).toHaveLength(6);
});

test("manual and discovered addresses share one identity and connection", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  await f.manager.connect({ ...device, id: "manual:192.0.2.1:8009" }, source);
  expect(f.manager.getState().devices).toHaveLength(1);
  expect(f.channel(0).closed).toBe(true);
  expect(f.device(0).id).toBe(device.id);
  expect(f.device(0).phase).toBe("ready");
});

test("clearing authentication cancels pending sessions and clears their instance state", async () => {
  const f = await fixture({ hang: true });
  const result = f.manager.connect(device, source).then(
    () => null,
    (error: unknown) => error,
  );
  await until(() => f.channels.length === 1);
  await f.manager.stopAll();
  expect(await result).toBeInstanceOf(Error);
  expect(f.channel(0).closed).toBe(true);
  expect(f.device(0).instanceId).toBeNull();
  expect(f.device(0).phase).toBe("idle");
});

test("settings changed during an acknowledgement are delivered on the next cycle", async () => {
  const f = await fixture({ deferSettings: true });
  await f.manager.connect(device, source);
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "SETTINGS"),
  );
  f.manager.setSettings({ ...DEFAULT_SETTINGS, scale: "large" });
  f.releaseSettings();
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "PING"),
  );
  await Effect.runPromise(f.clock.adjust("3 seconds"));
  await until(
    () =>
      f.channel(0).messages.filter((message) => message.type === "SETTINGS")
        .length === 2,
  );
  const updates = f
    .channel(0)
    .messages.filter((message) => message.type === "SETTINGS");
  expect(updates[0]?.settings.scale).toBe("normal");
  expect(updates[1]?.settings.scale).toBe("large");
});

test("discovered displays appear and leave unless they are casting", async () => {
  const f = await fixture();
  f.manager.discover();
  await until(() => f.browses.length === 1);
  const browse = f.browses[0];
  browse?.up(device);
  browse?.up({ ...device, id: "other", address: "192.0.2.2" });
  expect(f.manager.getState().devices).toHaveLength(2);
  await f.manager.connect(device, source);
  browse?.down(device.id);
  browse?.down("other");
  expect(f.manager.getState().devices.map((entry) => entry.id)).toEqual([
    device.id,
  ]);
});

test("discovery that fails, such as on a busy mDNS port, can start again", async () => {
  const f = await fixture();
  f.manager.discover();
  f.manager.discover();
  await until(() => f.browses.length === 1);
  const failure = f.browses[0]?.failure;
  if (failure)
    Effect.runSync(
      Deferred.fail(
        failure,
        CastDiscoveryError.make({ cause: new Error("EADDRINUSE") }),
      ),
    );
  await until(() => {
    f.manager.discover();
    return f.browses.length === 2;
  });
});

test("a TV that closes the receiver leaves the display idle without retrying", async () => {
  const f = await fixture();
  await f.manager.connect(device, source);
  await until(() =>
    f.channel(0).messages.some((message) => message.type === "PING"),
  );
  f.channel(0).fail?.(castError("receiverClosed", false));
  await until(() => f.channel(0).closed);
  await until(() => f.device(0).phase === "idle");
  expect(f.device(0)).toMatchObject({
    error: "receiverClosed",
    instanceId: source.instanceId,
  });
  await Effect.runPromise(f.clock.adjust("60 seconds"));
  expect(f.channels).toHaveLength(1);
  expect(
    f.states.some((state) =>
      state.devices.some((entry) => entry.phase === "reconnecting"),
    ),
  ).toBe(false);
});

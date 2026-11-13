/// <reference types="bun" />
import { afterEach, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  CAST_APP_ID,
  PROTOCOL_VERSION,
  type ReceiverMessage,
  type SenderMessage,
} from "@soulfiremc/cast-protocol";
import { Clock, Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { TestClock } from "effect/testing";
import {
  CastTransport,
  makeCastTransport,
  type CastBindings,
} from "./transport";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});
const device = { id: "tv", address: "192.0.2.1", port: 8009, name: "TV" };
async function fixture(
  options: {
    deferConnect?: boolean;
    incompatible?: boolean;
    launchError?: boolean;
    deferHello?: boolean;
  } = {},
) {
  const clockScope = Scope.makeUnsafe();
  const clock = await Effect.runPromise(
    TestClock.make().pipe(Effect.provideService(Scope.Scope, clockScope)),
  );
  const events: string[] = [];
  const sent: SenderMessage[] = [];
  const session = {
    appId: CAST_APP_ID,
    sessionId: "receiver-session",
    transportId: "transport",
  };
  class Channel extends EventEmitter {
    send(message: SenderMessage) {
      sent.push(message);
      if (
        options.deferHello &&
        message.type === "HELLO" &&
        sent.filter((entry) => entry.type === "HELLO").length === 1
      )
        return;
      const reply: ReceiverMessage =
        message.type === "HELLO"
          ? {
              type: "READY",
              requestId: message.requestId,
              sessionId: message.sessionId,
              version: options.incompatible
                ? PROTOCOL_VERSION + 1
                : PROTOCOL_VERSION,
            }
          : {
              type: "ACK",
              requestId: message.requestId,
              sessionId: message.sessionId,
            };
      this.emit("message", reply);
    }
  }
  class Application extends EventEmitter {
    constructor(_client: unknown, _session: typeof session) {
      super();
    }
    session = session;
    channel = new Channel();
    createController() {
      return this.channel;
    }
    close() {
      this.emit("close");
    }
  }
  const clients: Platform[] = [];
  class Platform extends EventEmitter {
    closed = 0;
    connectCallback: (() => void) | undefined;
    application: Application | undefined;
    constructor() {
      super();
      clients.push(this);
    }
    connect(_options: { host: string; port: number }, callback: () => void) {
      this.connectCallback = callback;
      if (!options.deferConnect) callback();
    }
    close() {
      this.closed++;
    }
    getSessions(
      callback: (error: Error | null, sessions: (typeof session)[]) => void,
    ) {
      events.push("sessions");
      callback(null, [session]);
    }
    join(
      _session: typeof session,
      _application: unknown,
      callback: (error: Error | null, app: Application) => void,
    ) {
      events.push("join");
      this.application = new Application(this, session);
      callback(null, this.application);
    }
    receiver = {
      request: (
        _message: unknown,
        callback: (
          error: Error | null,
          response: {
            type: string;
            status?: { applications: (typeof session)[] };
          },
        ) => void,
      ) => {
        events.push("launch");
        callback(options.launchError ? new Error("launch unavailable") : null, {
          type: "RECEIVER_STATUS",
          status: { applications: [session] },
        });
      },
      stop: (_id: string, callback: (error: Error | null) => void) => {
        events.push("stop");
        callback(null);
      },
    };
  }
  const bindings: CastBindings = {
    Client: Platform,
    Application,
    JsonController: Channel,
  };
  const runtime = ManagedRuntime.make(
    Layer.merge(
      makeCastTransport(() => bindings),
      Layer.succeed(Clock.Clock, clock),
    ),
  );
  const scope = Scope.makeUnsafe();
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await runtime.dispose();
    await Effect.runPromise(Scope.close(clockScope, Exit.void));
  };
  cleanup.push(dispose);
  const open = (relaunch = false) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const transport = yield* CastTransport;
        return yield* transport.open(device, relaunch);
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    );
  return { runtime, scope, clock, events, sent, clients, open, dispose };
}

test("the callback transport validates its handshake and correlates replies", async () => {
  const f = await fixture();
  const channel = await f.open();
  expect(f.sent[0].type).toBe("HELLO");
  const reply = await f.runtime.runPromise(
    channel.send({
      type: "PING",
      requestId: "ping",
      sessionId: channel.sessionId,
    }),
  );
  expect(reply.requestId).toBe("ping");
  await f.dispose();
  expect(f.clients[0].closed).toBe(1);
  expect(() =>
    f.clients[0].emit("error", new Error("late socket error")),
  ).not.toThrow();
});

test("Show on TV stops our existing receiver before launching and handshaking", async () => {
  const f = await fixture();
  await f.open(true);
  expect(f.events).toEqual(["sessions", "stop", "launch", "join"]);
});

test("launch timeout closes its socket and late callbacks cannot create a session", async () => {
  const f = await fixture({ deferConnect: true });
  const result = f.open().then(
    () => null,
    (error: unknown) => error,
  );
  await Bun.sleep(1);
  await Effect.runPromise(f.clock.adjust("15 seconds"));
  expect(await result).toBeInstanceOf(Error);
  await f.dispose();
  expect(f.clients[0].closed).toBe(1);
  f.clients[0].connectCallback?.();
  expect(f.events).toEqual([]);
});

test("a failed launch and a version mismatch release every acquired socket", async () => {
  for (const options of [{ launchError: true }, { incompatible: true }]) {
    const f = await fixture(options);
    await expect(f.open()).rejects.toBeInstanceOf(Error);
    await f.dispose();
    expect(f.clients[0].closed).toBe(1);
  }
});

test("post-login errors notify the session owner", async () => {
  const f = await fixture();
  const channel = await f.open();
  let errors = 0;
  channel.onFailure(() => {
    errors++;
  });
  f.clients[0].emit("error", new Error("device timeout"));
  expect(errors).toBe(1);
});

test("a receiver that starts slowly can complete a repeated idempotent handshake", async () => {
  const f = await fixture({ deferHello: true });
  const result = f.open();
  await Bun.sleep(1);
  await Effect.runPromise(f.clock.adjust("3500 millis"));
  const channel = await result;
  expect(f.sent.filter((message) => message.type === "HELLO")).toHaveLength(2);
  expect(channel.sessionId).toBe(f.sent[0].sessionId);
  expect(f.clients).toHaveLength(1);
});

/// <reference types="bun-types/test" />
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { fromBinary } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { PovInputRequestSchema, PovService } from "@/generated/soulfire/pov_pb";
import { startPovSession } from "./pov-session";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    Socket.instances.push(this);
  }
  sent: Uint8Array[] = [];
  send(data: Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const originalSocket = globalThis.WebSocket;
const sessions: ReturnType<typeof startPovSession>[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  Socket.instances = [];
  Object.defineProperty(globalThis, "WebSocket", {
    value: Socket,
    configurable: true,
  });
});
afterEach(() => {
  for (const session of sessions.splice(0)) session.stop();
  Object.defineProperty(globalThis, "WebSocket", {
    value: originalSocket,
    configurable: true,
  });
  jest.useRealTimers();
});
async function settle() {
  for (let index = 0; index < 1000; index++) await Promise.resolve();
}

function fixture(mode: "no-frame" | "frame" | "offline" | "transient") {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const errors: Error[] = [];
  const transport = createRouterTransport(({ service }) => {
    service(PovService, {
      async *watch(_request, context) {
        calls++;
        signal = context.signal;
        if (mode === "offline")
          throw new ConnectError("Bot is not online", Code.FailedPrecondition);
        if (mode === "transient" && calls === 1)
          throw new ConnectError("Disconnected", Code.Unavailable);
        if (mode !== "no-frame") yield { inputToken: "test-input-token" };
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
  const session = startPovSession(
    transport,
    "ws://localhost/pov/input",
    "project",
    "bot",
    () => ({ width: 640, height: 480 }),
    () => {},
    (error) => errors.push(error),
    () => {},
    () => undefined,
    60,
  );
  sessions.push(session);
  return {
    session,
    errors,
    calls: () => calls,
    aborted: () => signal?.aborted,
  };
}

test("a watch stream with no first frame stops after its connection deadline", async () => {
  const state = fixture("no-frame");
  await settle();
  expect(state.calls()).toBe(1);
  jest.advanceTimersByTime(15_000);
  await settle();
  expect(state.errors).toHaveLength(1);
  expect(ConnectError.from(state.errors[0]).code).toBe(Code.DeadlineExceeded);
  expect(state.aborted()).toBe(true);
  jest.advanceTimersByTime(60_000);
  await settle();
  expect(state.calls()).toBe(1);
});

test("the input WebSocket handshake shares the connection deadline", async () => {
  const state = fixture("frame");
  await settle();
  expect(Socket.instances).toHaveLength(1);
  jest.advanceTimersByTime(15_000);
  await settle();
  expect(state.errors).toHaveLength(1);
  expect(Socket.instances[0].readyState).toBe(3);
});

test("a connected stream clears the deadline and stop cancels all pending work", async () => {
  const state = fixture("frame");
  await settle();
  Socket.instances[0].open();
  jest.advanceTimersByTime(20_000);
  await settle();
  expect(state.errors).toHaveLength(0);
  expect(state.aborted()).toBe(false);
  state.session.stop();
  jest.advanceTimersByTime(60_000);
  await settle();
  expect(state.aborted()).toBe(true);
  expect(state.calls()).toBe(1);
  expect(state.errors).toHaveLength(0);
});

test("offline bots stop instead of reconnecting forever", async () => {
  const state = fixture("offline");
  await settle();
  jest.advanceTimersByTime(60_000);
  await settle();
  expect(state.calls()).toBe(1);
  expect(state.errors).toHaveLength(1);
  expect(ConnectError.from(state.errors[0]).code).toBe(Code.FailedPrecondition);
});

test("transient stream failures still reconnect with a fresh attempt", async () => {
  const state = fixture("transient");
  await settle();
  expect(state.calls()).toBe(1);
  jest.advanceTimersByTime(500);
  await settle();
  expect(state.calls()).toBe(2);
  expect(state.errors).toHaveLength(0);
  Socket.instances[0].open();
  state.session.stop();
});

test("stopping during reconnect backoff prevents another RPC attempt", async () => {
  const state = fixture("transient");
  await settle();
  state.session.stop();
  jest.advanceTimersByTime(60_000);
  await settle();
  expect(state.calls()).toBe(1);
  expect(state.errors).toHaveLength(0);
});

test("reconnecting releases the old socket and ignores its late callbacks", async () => {
  const state = fixture("frame");
  await settle();
  const first = Socket.instances[0];
  first.open();
  state.session.requestKeyFrame();
  const staleClose = first.onclose!;
  const staleOpen = first.onopen!;
  const firstInput = fromBinary(PovInputRequestSchema, first.sent[0]);
  first.onmessage!({ data: "9999" });
  const sentBeforeReconnect = first.sent.length;
  staleOpen();
  state.session.requestKeyFrame();
  expect(first.sent).toHaveLength(sentBeforeReconnect);
  await settle();
  expect(first.readyState).toBe(3);
  expect(first.onmessage).toBeNull();
  jest.advanceTimersByTime(500);
  await settle();
  expect(state.calls()).toBe(2);
  const second = Socket.instances[1];
  second.open();
  state.session.requestKeyFrame();
  const secondInput = fromBinary(PovInputRequestSchema, second.sent[0]);
  expect(secondInput.sessionId).not.toBe(firstInput.sessionId);
  expect(secondInput.sequence).toBe(1n);
  expect(secondInput.captured).toBe(false);
  staleClose();
  await settle();
  jest.advanceTimersByTime(1_000);
  await settle();
  expect(state.calls()).toBe(2);
  expect(second.readyState).toBe(Socket.OPEN);
  expect(state.errors).toHaveLength(0);
});

test("stopping before codec discovery finishes never opens a connection", async () => {
  const state = fixture("frame");
  state.session.stop();
  await settle();
  jest.advanceTimersByTime(60_000);
  await settle();
  expect(state.calls()).toBe(0);
  expect(Socket.instances).toHaveLength(0);
  expect(state.errors).toHaveLength(0);
});

/// <reference types="bun-types/test" />
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { PovService } from "@/generated/soulfire/pov_pb";
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
  send() {}
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

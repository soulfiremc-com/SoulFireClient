import { Code, ConnectError, createClient } from "@connectrpc/connect";
import {
  type PovFrame,
  type PovInputEvent,
  PovInputEvent_Kind,
  PovService,
} from "@/generated/soulfire/pov_pb";
import { createTransport } from "@/lib/web-rpc";

// Bound both input and frame queues. A replacement stream always gets a fresh lease and sequence.
export function startPovSession(
  instanceId: string,
  botId: string,
  dimensions: () => { width: number; height: number } | null,
  onFrame: (frame: PovFrame) => void,
  onError: (error: Error) => void,
  onReconnecting: () => void,
) {
  const transport = createTransport();
  if (!transport)
    throw new Error("Interactive POV requires a connected server.");
  const client = createClient(PovService, transport);
  let events: PovInputEvent[] = [];
  let captured = false;
  let pendingEscape = false;
  let ready = false;
  let sequence = 0n;
  let lastSent = 0;
  let lastCaptured = false;
  let stopped = false;
  let attempt: { id: string; abort: AbortController; sending: boolean } | null =
    null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let wakeRetry: (() => void) | undefined;

  function stop() {
    stopped = true;
    clearInterval(timer);
    clearTimeout(retryTimer);
    wakeRetry?.();
    attempt?.abort.abort();
    events = [];
  }
  function fail(reason: unknown) {
    if (stopped) return;
    stop();
    onError(reason instanceof Error ? reason : new Error(String(reason)));
  }
  function reconnect(reason?: unknown) {
    if (stopped) return;
    if (
      reason instanceof ConnectError &&
      [
        Code.PermissionDenied,
        Code.Unauthenticated,
        Code.InvalidArgument,
        Code.Unimplemented,
      ].includes(reason.code)
    ) {
      fail(reason);
      return;
    }
    ready = false;
    captured = false;
    events = [];
    pendingEscape = false;
    attempt?.abort.abort();
    onReconnecting();
  }
  async function flush() {
    const current = attempt;
    if (!ready || !current || current.sending || stopped) return;
    if (
      !pendingEscape &&
      !events.length &&
      captured === lastCaptured &&
      performance.now() - lastSent < 500
    )
      return;
    const size = dimensions();
    if (!size) return;
    current.sending = true;
    const batch = events;
    events = [];
    const batchCaptured = captured;
    const batchEscape = pendingEscape;
    pendingEscape = false;
    try {
      await client.input(
        {
          sessionId: current.id,
          sequence: ++sequence,
          captured: batchCaptured,
          escape: batchEscape,
          ...size,
          events: batch,
        },
        { signal: current.abort.signal, timeoutMs: 4000 },
      );
      if (attempt === current) {
        lastSent = performance.now();
        lastCaptured = batchCaptured;
      }
    } catch (error) {
      if (attempt === current && !current.abort.signal.aborted)
        reconnect(error);
    } finally {
      current.sending = false;
    }
  }
  const timer = setInterval(() => {
    void flush();
  }, 16);
  void (async () => {
    let failures = 0;
    while (!stopped) {
      const size = dimensions();
      if (size) {
        const current = {
          id: crypto.randomUUID(),
          abort: new AbortController(),
          sending: false,
        };
        attempt = current;
        sequence = 0n;
        lastSent = 0;
        lastCaptured = false;
        try {
          for await (const frame of client.watch(
            { instanceId, botId, sessionId: current.id, ...size },
            { signal: current.abort.signal },
          )) {
            if (stopped || current.abort.signal.aborted) break;
            ready = true;
            failures = 0;
            onFrame(frame);
          }
          if (!stopped) reconnect();
        } catch (error) {
          if (!stopped) reconnect(error);
        }
      }
      if (stopped) break;
      onReconnecting();
      await new Promise<void>((resolve) => {
        wakeRetry = resolve;
        retryTimer = setTimeout(
          resolve,
          Math.min(500 * 2 ** Math.min(failures++, 4), 5000),
        );
      });
      wakeRetry = undefined;
    }
  })();

  return {
    stop,
    escape() {
      pendingEscape = true;
    },
    capture(value: boolean) {
      captured = ready && value;
      if (!value) events = [];
      void flush();
    },
    enqueue(event: PovInputEvent) {
      if (!captured || stopped || !ready) return;
      const previous = events[events.length - 1];
      if (
        previous &&
        event.kind === PovInputEvent_Kind.MOVE &&
        previous.kind === PovInputEvent_Kind.MOVE &&
        previous.relative === event.relative
      ) {
        previous.x = event.relative ? previous.x + event.x : event.x;
        previous.y = event.relative ? previous.y + event.y : event.y;
        return;
      }
      if (events.length >= 128) {
        reconnect();
        return;
      }
      events.push(event);
    },
  };
}

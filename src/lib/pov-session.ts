import { createClient } from "@connectrpc/connect";
import {
  type PovFrame,
  type PovInputEvent,
  PovInputEvent_Kind,
  PovService,
} from "@/generated/soulfire/pov_pb";
import { createTransport } from "@/lib/web-rpc";

// One input request in flight, bounded event batches, and one replaceable decoded frame.
export function startPovSession(
  instanceId: string,
  botId: string,
  dimensions: () => { width: number; height: number } | null,
  onFrame: (frame: PovFrame) => void,
  onError: (error: Error) => void,
) {
  const transport = createTransport();
  if (!transport)
    throw new Error("Interactive POV requires a connected server.");
  const client = createClient(PovService, transport);
  const sessionId = crypto.randomUUID();
  const abort = new AbortController();
  let events: PovInputEvent[] = [];
  let captured = false;
  let closeScreen = false;
  let ready = false;
  let sending = false;
  let sequence = 0n;
  let lastSent = 0;
  let lastCaptured = false;
  let stopped = false;
  const initialSize = dimensions();
  if (!initialSize) throw new Error("The POV viewport is not visible.");

  function stop() {
    stopped = true;
    clearInterval(timer);
    abort.abort();
    events = [];
  }
  function fail(reason: unknown) {
    if (stopped) return;
    stop();
    onError(reason instanceof Error ? reason : new Error(String(reason)));
  }
  async function flush() {
    if (!ready || sending || stopped) return;
    if (
      !closeScreen &&
      !events.length &&
      captured === lastCaptured &&
      performance.now() - lastSent < 500
    )
      return;
    const size = dimensions();
    if (!size) {
      fail(new Error("The POV viewport is no longer visible."));
      return;
    }
    sending = true;
    const batch = events;
    events = [];
    const batchCaptured = captured;
    const close = closeScreen;
    closeScreen = false;
    try {
      await client.input(
        {
          sessionId,
          sequence: ++sequence,
          captured: batchCaptured,
          closeScreen: close,
          ...size,
          events: batch,
        },
        { signal: abort.signal, timeoutMs: 4000 },
      );
      lastSent = performance.now();
      lastCaptured = batchCaptured;
    } catch (error) {
      fail(error);
    } finally {
      sending = false;
    }
  }
  const timer = setInterval(() => {
    void flush();
  }, 16);
  void (async () => {
    try {
      for await (const frame of client.watch(
        { instanceId, botId, sessionId, ...initialSize },
        { signal: abort.signal },
      )) {
        if (stopped) break;
        ready = true;
        onFrame(frame);
      }
      if (!stopped)
        fail(new Error("The POV stream ended. Reconnect to continue."));
    } catch (error) {
      fail(error);
    }
  })();

  return {
    stop,
    closeScreen() {
      closeScreen = true;
    },
    capture(value: boolean) {
      captured = value;
      if (!value) events = [];
      void flush();
    },
    enqueue(event: PovInputEvent) {
      if (!captured || stopped) return;
      // Only adjacent movement events can merge. Never reorder a click or keystroke.
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
        fail(new Error("Input connection stalled. Reconnect to continue."));
        return;
      }
      events.push(event);
    },
  };
}

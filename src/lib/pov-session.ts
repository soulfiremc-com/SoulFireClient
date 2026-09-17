import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import {
  type PovFrame,
  type PovInputEvent,
  PovInputEvent_Kind,
  PovInputRequestSchema,
  PovService,
  type PovStreamFeedback,
} from "@/generated/soulfire/pov_pb";
import { povCodecs, povDisplayFps } from "@/lib/pov-display";
import { PovInputSources } from "@/lib/pov-input-sources";
import { createTransport, povInputUrl } from "@/lib/web-rpc";

// Bound both input and frame queues. A replacement stream always gets a fresh lease and sequence.
export function startPovSession(
  instanceId: string,
  botId: string,
  dimensions: () => { width: number; height: number; maxFps?: number } | null,
  onFrame: (frame: PovFrame) => void,
  onError: (error: Error) => void,
  onReconnecting: () => void,
  feedback: () => PovStreamFeedback | undefined,
  maxFps?: number,
  onClipboard: (text: string) => void = () => {},
) {
  const transport = createTransport();
  if (!transport)
    throw new Error("Interactive POV requires a connected server.");
  const client = createClient(PovService, transport);
  let events: PovInputEvent[] = [];
  const sources = new PovInputSources();
  let captured = false;
  let pendingEscape = false;
  let pendingKeyFrame = false;
  let ready = false;
  let sequence = 0n;
  let clipboard: string | undefined;
  let readClipboard = false;
  let clipboardSequence = 0n;
  let lastSent = 0;
  let lastCaptured = false;
  let stopped = false;
  let attempt: {
    id: string;
    abort: AbortController;
    socket: WebSocket | null;
    token: string;
    acknowledged: bigint;
  } | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let wakeRetry: (() => void) | undefined;

  function stop() {
    stopped = true;
    clearInterval(timer);
    clearTimeout(retryTimer);
    wakeRetry?.();
    attempt?.abort.abort();
    attempt?.socket?.close();
    events = [];
    sources.reset();
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
    sources.reset();
    pendingEscape = false;
    clipboard = undefined;
    readClipboard = false;
    clipboardSequence = 0n;
    attempt?.abort.abort();
    attempt?.socket?.close();
    onReconnecting();
  }
  function flush() {
    const current = attempt;
    if (
      !ready ||
      !current ||
      current.socket?.readyState !== WebSocket.OPEN ||
      stopped
    )
      return;
    if (
      current.socket.bufferedAmount > 65_536 ||
      sequence - current.acknowledged >= 120n
    ) {
      reconnect();
      return;
    }
    if (
      !readClipboard &&
      clipboard === undefined &&
      !pendingEscape &&
      !pendingKeyFrame &&
      !events.length &&
      captured === lastCaptured &&
      performance.now() - lastSent < 500
    )
      return;
    const size = dimensions();
    if (!size) return;
    const batch = events;
    events = [];
    const batchCaptured = captured;
    const batchEscape = pendingEscape;
    const requestKeyFrame = pendingKeyFrame;
    pendingKeyFrame = false;
    pendingEscape = false;
    try {
      current.socket.send(
        toBinary(
          PovInputRequestSchema,
          create(PovInputRequestSchema, {
            sessionId: current.id,
            inputToken: current.token,
            sequence: ++sequence,
            captured: batchCaptured,
            escape: batchEscape,
            requestKeyFrame,
            ...size,
            events: batch,
            feedback: feedback(),
            clipboard,
            readClipboard,
          }),
        ),
      );
      if (readClipboard) clipboardSequence = sequence;
      readClipboard = false;
      clipboard = undefined;
      lastSent = performance.now();
      lastCaptured = batchCaptured;
    } catch (error) {
      if (attempt === current && !current.abort.signal.aborted)
        reconnect(error);
    }
  }

  const timer = setInterval(() => {
    void flush();
  }, 16);
  void (async () => {
    const [displayFps, codecs] = await Promise.all([
      maxFps ?? povDisplayFps(window),
      povCodecs(),
    ]);
    let failures = 0;
    while (!stopped) {
      const size = dimensions();
      if (size) {
        const current = {
          id: crypto.randomUUID(),
          abort: new AbortController(),
          socket: null as WebSocket | null,
          token: "",
          acknowledged: 0n,
        };
        attempt = current;
        sequence = 0n;
        lastSent = 0;
        lastCaptured = false;
        try {
          for await (const frame of client.watch(
            {
              instanceId,
              botId,
              sessionId: current.id,
              ...size,
              maxFps: size.maxFps ?? displayFps,
              codecs,
            },
            { signal: current.abort.signal },
          )) {
            if (stopped || current.abort.signal.aborted) break;
            if (!current.socket) {
              current.token = frame.inputToken;
              if (!current.token)
                throw new ConnectError(
                  "Update the server to use the POV input channel.",
                  Code.Unimplemented,
                );
              const socket = new WebSocket(povInputUrl());
              current.socket = socket;
              socket.onopen = () => {
                if (attempt === current) {
                  ready = true;
                  flush();
                }
              };
              socket.onmessage = (event) => {
                if (attempt !== current) return;
                try {
                  const ack = BigInt(event.data);
                  if (ack < current.acknowledged || ack > sequence)
                    throw new Error("Invalid input acknowledgement");
                  current.acknowledged = ack;
                } catch (error) {
                  reconnect(error);
                }
              };
              socket.onerror = () => {
                if (attempt === current && !current.abort.signal.aborted)
                  reconnect();
              };
              socket.onclose = () => {
                if (attempt === current && !current.abort.signal.aborted)
                  reconnect();
              };
            }
            failures = 0;
            if (
              clipboardSequence !== 0n &&
              frame.clipboardSequence === clipboardSequence &&
              frame.clipboard !== undefined
            ) {
              clipboardSequence = 0n;
              onClipboard(frame.clipboard);
            }
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
    requestKeyFrame() {
      pendingKeyFrame = true;
      void flush();
    },
    escape() {
      pendingEscape = true;
    },
    capture(value: boolean) {
      captured = value;
      if (!value) {
        events = [];
        sources.reset();
        clipboard = undefined;
        readClipboard = false;
        clipboardSequence = 0n;
      }
      void flush();
    },
    copy() {
      if (captured && ready) {
        readClipboard = true;
        flush();
      }
    },
    paste(text: string) {
      if (!captured || !ready) return;
      clipboard = text.slice(0, 16_384);
      flush();
    },
    enqueue(event: PovInputEvent, source = "keyboard") {
      if (!captured || stopped || !ready) return;
      if (!sources.accept(event, source)) return;
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

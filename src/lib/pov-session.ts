import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import {
  type PovFrame,
  type PovInputEvent,
  PovInputEvent_Kind,
  PovInputEventSchema,
  PovInputRequestSchema,
  PovService,
  type PovStreamFeedback,
} from "@/generated/soulfire/pov_pb";
import { Cause, Deferred, Effect, Fiber, Result, Stream } from "effect";
import { t } from "i18next";
import { povCodecs, povDisplayFps } from "@/lib/pov-display";
import { PovInputQueue } from "@/lib/pov-input-queue";
import { createRpcClient } from "@/lib/rpc";

const CONNECTION_TIMEOUT_MS = 15_000;

// Bound both input and frame queues. A replacement stream always gets a fresh lease and sequence.
export function startPovSession(
  transport: Transport,
  inputUrl: string,
  instanceId: string,
  botId: string,
  dimensions: () => { width: number; height: number; maxFps?: number } | null,
  onFrame: (frame: PovFrame) => void,
  onError: (error: Error) => void,
  onReconnecting: () => void,
  feedback: () => PovStreamFeedback | undefined,
  maxFps?: number,
  onClipboard: (text: string) => void = () => {},
  onOpenUrl: (url: string) => void = () => {},
) {
  const client = createRpcClient(PovService, transport);
  const inputs = new PovInputQueue();
  let captured = false;
  let audioEnabled = false;
  let lastAudioEnabled = false;
  let pendingKeyFrame = false;
  let ready = false;
  let sequence = 0n;
  let clipboard: string | undefined;
  let readClipboard = false;
  let clipboardSequence = 0n;
  let lastSent = 0;
  let lastCaptured = false;
  let stopped = false;
  // stop() sets this flag from outside the reconnect loop.
  const isStopped = () => stopped;
  let attempt: {
    id: string;
    abort: AbortController;
    socket: WebSocket | null;
    token: string;
    acknowledged: bigint;
    connected: Deferred.Deferred<void>;
    failure: Deferred.Deferred<never, unknown>;
  } | null = null;
  let sessionFiber: Fiber.Fiber<void> | undefined;
  const connectionTimeout = new ConnectError(
    t("instance:bots.pov.connectTimeout"),
    Code.DeadlineExceeded,
  );

  function stop() {
    if (stopped) return;
    stopped = true;
    if (sessionFiber) Effect.runFork(Fiber.interrupt(sessionFiber));
    inputs.reset();
  }
  function fail(reason: unknown) {
    if (stopped) return;
    stop();
    onError(reason instanceof Error ? reason : new Error(String(reason)));
  }
  function reconnect(
    reason: unknown = new ConnectError(
      "POV input channel closed",
      Code.Unavailable,
    ),
  ) {
    if (stopped || !attempt) return;
    ready = false;
    Deferred.doneUnsafe(attempt.failure, Effect.fail(reason));
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
      !pendingKeyFrame &&
      inputs.length === 0 &&
      captured === lastCaptured &&
      audioEnabled === lastAudioEnabled &&
      performance.now() - lastSent < 500
    )
      return;
    const size = dimensions();
    if (!size) return;
    const batch = inputs.drain();
    const batchCaptured = captured;
    const requestKeyFrame = pendingKeyFrame;
    pendingKeyFrame = false;
    try {
      current.socket.send(
        toBinary(
          PovInputRequestSchema,
          create(PovInputRequestSchema, {
            sessionId: current.id,
            inputToken: current.token,
            sequence: ++sequence,
            captured: batchCaptured,
            audioEnabled,
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
      lastAudioEnabled = audioEnabled;
    } catch (error) {
      if (attempt === current && !current.abort.signal.aborted)
        reconnect(error);
    }
  }

  sessionFiber = Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => setInterval(flush, 16)),
          (timer) =>
            Effect.sync(() => {
              clearInterval(timer);
            }),
        );
        const [displayFps, codecs] = yield* Effect.all(
          [
            maxFps === undefined
              ? Effect.tryPromise({
                  try: () => povDisplayFps(window),
                  catch: (error) => error,
                })
              : Effect.succeed(maxFps),
            Effect.tryPromise({
              try: () => povCodecs(),
              catch: (error) => error,
            }),
          ],
          { concurrency: "unbounded" },
        );
        let failures = 0;
        while (!isStopped()) {
          const size = dimensions();
          if (size) {
            const result = yield* Effect.result(
              Effect.scoped(
                // oxlint-disable-next-line eslint/no-loop-func -- the session runs to completion inside this iteration and resets the failure count for the next one
                Effect.gen(function* () {
                  const current = yield* Effect.acquireRelease(
                    Effect.sync(() => ({
                      id: crypto.randomUUID(),
                      abort: new AbortController(),
                      socket: null as WebSocket | null,
                      token: "",
                      acknowledged: 0n,
                      connected: Deferred.makeUnsafe<void>(),
                      failure: Deferred.makeUnsafe<never, unknown>(),
                    })),
                    (active) =>
                      Effect.sync(() => {
                        active.abort.abort();
                        if (active.socket) {
                          // oxlint-disable-next-line unicorn/prefer-add-event-listener -- clears the handlers that the session assigned to this socket
                          active.socket.onopen = null;
                          // oxlint-disable-next-line unicorn/prefer-add-event-listener -- clears the handlers that the session assigned to this socket
                          active.socket.onmessage = null;
                          // oxlint-disable-next-line unicorn/prefer-add-event-listener -- clears the handlers that the session assigned to this socket
                          active.socket.onerror = null;
                          // oxlint-disable-next-line unicorn/prefer-add-event-listener -- clears the handlers that the session assigned to this socket
                          active.socket.onclose = null;
                          active.socket.close();
                        }
                        if (attempt === active) {
                          attempt = null;
                          ready = false;
                          captured = false;
                          inputs.reset();
                          clipboard = undefined;
                          readClipboard = false;
                          clipboardSequence = 0n;
                        }
                      }),
                  );
                  attempt = current;
                  sequence = 0n;
                  lastSent = 0;
                  lastCaptured = false;
                  lastAudioEnabled = false;
                  const watch = client
                    .watch(
                      {
                        instanceId,
                        botId,
                        sessionId: current.id,
                        ...size,
                        maxFps: size.maxFps ?? displayFps,
                        codecs,
                      },
                      { signal: current.abort.signal },
                    )
                    .pipe(
                      Stream.takeWhile(
                        () => !stopped && !current.abort.signal.aborted,
                      ),
                      Stream.runForEach((frame) =>
                        Effect.try({
                          try: () => {
                            if (!current.socket) {
                              current.token = frame.inputToken;
                              if (!current.token)
                                throw new ConnectError(
                                  t("instance:bots.pov.inputUpdateServer"),
                                  Code.Unimplemented,
                                );
                              const socket = new WebSocket(inputUrl);
                              current.socket = socket;
                              // oxlint-disable-next-line unicorn/prefer-add-event-listener -- the session keeps one handler per socket event and clears them when it releases the socket
                              socket.onopen = () => {
                                if (
                                  attempt === current &&
                                  !stopped &&
                                  !current.abort.signal.aborted
                                ) {
                                  Deferred.doneUnsafe(
                                    current.connected,
                                    Effect.void,
                                  );
                                  ready = true;
                                  flush();
                                }
                              };
                              // oxlint-disable-next-line unicorn/prefer-add-event-listener -- the session keeps one handler per socket event and clears them when it releases the socket
                              socket.onmessage = (
                                event: MessageEvent<unknown>,
                              ) => {
                                if (attempt !== current) return;
                                try {
                                  if (typeof event.data !== "string")
                                    throw new TypeError(
                                      "Invalid input acknowledgement",
                                    );
                                  const ack = BigInt(event.data);
                                  if (
                                    ack < current.acknowledged ||
                                    ack > sequence
                                  )
                                    throw new Error(
                                      "Invalid input acknowledgement",
                                    );
                                  current.acknowledged = ack;
                                } catch (error) {
                                  reconnect(error);
                                }
                              };
                              // oxlint-disable-next-line unicorn/prefer-add-event-listener -- the session keeps one handler per socket event and clears them when it releases the socket
                              socket.onerror = socket.onclose = () => {
                                if (
                                  attempt === current &&
                                  !current.abort.signal.aborted
                                )
                                  reconnect();
                              };
                            }
                            failures = 0;
                            if (
                              (frame.clipboardSequence === 0n ||
                                frame.clipboardSequence ===
                                  clipboardSequence) &&
                              frame.clipboard !== undefined
                            ) {
                              clipboardSequence = 0n;
                              onClipboard(frame.clipboard);
                            }
                            if (frame.openUrl !== undefined)
                              onOpenUrl(frame.openUrl);
                            onFrame(frame);
                          },
                          catch: (error) => error,
                        }),
                      ),
                    );
                  const deadline = Deferred.await(current.connected).pipe(
                    Effect.timeoutOrElse({
                      duration: CONNECTION_TIMEOUT_MS,
                      orElse: () => Effect.fail(connectionTimeout),
                    }),
                    Effect.andThen(Effect.never),
                  );
                  yield* Effect.raceFirst(
                    watch,
                    Effect.raceFirst(Deferred.await(current.failure), deadline),
                  );
                }),
              ),
            );
            if (Result.isFailure(result)) {
              const error = result.failure;
              if (
                error === connectionTimeout ||
                (error instanceof ConnectError &&
                  [
                    Code.NotFound,
                    Code.PermissionDenied,
                    Code.Unauthenticated,
                    Code.InvalidArgument,
                    Code.Unimplemented,
                    Code.FailedPrecondition,
                  ].includes(error.code))
              )
                return yield* Effect.fail(error);
            }
          }
          if (stopped) break;
          onReconnecting();
          yield* Effect.sleep(
            Math.min(500 * 2 ** Math.min(failures++, 4), 5000),
          );
        }
        return undefined;
      }),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          fail(Cause.squash(cause));
        }),
      ),
    ),
  );

  // A function call, because flush() can change these flags.
  const acceptsInput = () => captured && !stopped && ready;

  function enqueue(event: PovInputEvent, source = "keyboard") {
    if (!acceptsInput()) return;
    // One browser text commit can fill multiple native input packets. Flush
    // before accepting the next event so held-input ownership stays ordered.
    if (inputs.isFull) flush();
    if (!acceptsInput()) return;
    if (!inputs.enqueue(event, source)) reconnect();
  }

  return {
    stop,
    audio(value: boolean) {
      audioEnabled = value;
      flush();
    },
    requestKeyFrame() {
      pendingKeyFrame = true;
      flush();
    },
    escape() {
      // The server handles its escape flag before events. Keep this key ordered
      // with earlier clicks and text, including when the browser consumes it.
      for (const action of [1, 0])
        enqueue(
          create(PovInputEventSchema, {
            kind: PovInputEvent_Kind.KEY,
            code: 256,
            action,
          }),
        );
    },
    capture(value: boolean) {
      // Deliver the last edit or click before the server releases held inputs.
      if (captured && !value) flush();
      captured = value;
      if (!value) {
        inputs.reset();
        clipboard = undefined;
        readClipboard = false;
        clipboardSequence = 0n;
      }
      flush();
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
    enqueue,
  };
}

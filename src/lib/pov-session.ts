import { create, toBinary } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createClient,
  type Transport,
} from "@connectrpc/connect";
import {
  type PovFrame,
  type PovInputEvent,
  PovInputEvent_Kind,
  PovInputEventSchema,
  PovInputRequestSchema,
  PovService,
  type PovStreamFeedback,
} from "@/generated/soulfire/pov_pb";
import { Cause, Deferred, Effect, Fiber, Result } from "effect";
import { povCodecs, povDisplayFps } from "@/lib/pov-display";
import { PovInputQueue } from "@/lib/pov-input-queue";

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
  const client = createClient(PovService, transport);
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
    "Bot view did not connect within 15 seconds. Check that the bot is online and try again.",
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
      !inputs.length &&
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
          (timer) => Effect.sync(() => clearInterval(timer)),
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
        while (!stopped) {
          const size = dimensions();
          if (size) {
            const result = yield* Effect.result(
              Effect.scoped(
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
                    (current) =>
                      Effect.sync(() => {
                        current.abort.abort();
                        if (current.socket) {
                          current.socket.onopen = null;
                          current.socket.onmessage = null;
                          current.socket.onerror = null;
                          current.socket.onclose = null;
                          current.socket.close();
                        }
                        if (attempt === current) {
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
                  const watch = Effect.tryPromise({
                    try: async (signal) => {
                      for await (const frame of client.watch(
                        {
                          instanceId,
                          botId,
                          sessionId: current.id,
                          ...size,
                          maxFps: size.maxFps ?? displayFps,
                          codecs,
                        },
                        {
                          signal: AbortSignal.any([
                            signal,
                            current.abort.signal,
                          ]),
                        },
                      )) {
                        if (stopped || current.abort.signal.aborted) break;
                        if (!current.socket) {
                          current.token = frame.inputToken;
                          if (!current.token)
                            throw new ConnectError(
                              "Update the server to use the POV input channel.",
                              Code.Unimplemented,
                            );
                          const socket = new WebSocket(inputUrl);
                          current.socket = socket;
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
                          socket.onmessage = (event) => {
                            if (attempt !== current) return;
                            try {
                              const ack = BigInt(event.data);
                              if (ack < current.acknowledged || ack > sequence)
                                throw new Error(
                                  "Invalid input acknowledgement",
                                );
                              current.acknowledged = ack;
                            } catch (error) {
                              reconnect(error);
                            }
                          };
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
                            frame.clipboardSequence === clipboardSequence) &&
                          frame.clipboard !== undefined
                        ) {
                          clipboardSequence = 0n;
                          onClipboard(frame.clipboard);
                        }
                        if (frame.openUrl !== undefined)
                          onOpenUrl(frame.openUrl);
                        onFrame(frame);
                      }
                    },
                    catch: (error) => error,
                  });
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
      }),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => fail(Cause.squash(cause))),
      ),
    ),
  );

  function enqueue(event: PovInputEvent, source = "keyboard") {
    if (!captured || stopped || !ready) return;
    // One browser text commit can fill multiple native input packets. Flush
    // before accepting the next event so held-input ownership stays ordered.
    if (inputs.isFull) flush();
    if (!captured || stopped || !ready) return;
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
      void flush();
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
    enqueue,
  };
}

import {
  DEFAULT_SETTINGS,
  type CastDevice,
  type CastDeviceState,
  type CastSource,
  type CastState,
  type DisplaySettings,
  type ReceiverMessage,
} from "@soulfiremc/cast-protocol";
import {
  Cause,
  Deferred,
  Effect,
  Fiber,
  Layer,
  ManagedRuntime,
  Semaphore,
} from "effect";
import { CastDiscovery, CastDiscoveryLive } from "./discovery";
import { newCastRequestId } from "./request-id";
import { castError, type CastError } from "./errors";
import { MetricsSource, MetricsSourceLive } from "./metrics-source";
import { CastTransport, CastTransportLive } from "./transport";

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1000;

interface ActiveSession {
  readonly generation: number;
  readonly fiber: Fiber.Fiber<void>;
}
type Service = CastDiscovery | CastTransport | MetricsSource;

export class CastSessionManager {
  private readonly runtime: ManagedRuntime.ManagedRuntime<Service, never>;
  private readonly devices = new Map<string, CastDeviceState>();
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly lock = Semaphore.makeUnsafe(1);
  private discovery: Fiber.Fiber<void> | undefined;
  private discovering = false;
  private generation = 0;
  private revision = 0;
  private settings: DisplaySettings = DEFAULT_SETTINGS;
  private disposed = false;
  private sourceEpoch = 0;
  private disposal: Promise<void> | undefined;

  private readonly publish: (state: CastState) => void;

  constructor(
    publish: (state: CastState) => void,
    layer: Layer.Layer<Service> = Layer.mergeAll(
      CastDiscoveryLive,
      CastTransportLive,
      MetricsSourceLive,
    ),
  ) {
    this.publish = publish;

    this.runtime = ManagedRuntime.make(layer);
  }

  getState(): CastState {
    return {
      revision: this.revision,
      devices: Array.from(this.devices.values()),
      settings: this.settings,
    };
  }

  discover(): void {
    if (this.discovering || this.disposed) return;
    this.discovering = true;
    this.discovery = this.runtime.runFork(
      Effect.flatMap(CastDiscovery, (service) =>
        service.browse({
          up: (device) => {
            this.registerDevice(device);
          },
          down: (id) => {
            if (!this.sessions.has(id) && this.devices.delete(id))
              this.changed();
          },
        }),
      ).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Cast discovery failed", error),
        ),
        // A failed browse can start again on the next discover request.
        Effect.ensuring(
          Effect.sync(() => {
            this.discovering = false;
          }),
        ),
      ),
    );
  }

  registerDevice(discovered: CastDevice): CastDevice {
    const known = Array.from(this.devices.values()).find(
      (candidate) =>
        candidate.address === discovered.address &&
        candidate.port === discovered.port,
    );
    const device = known ? { ...discovered, id: known.id } : discovered;
    const previous = this.devices.get(device.id);
    this.devices.set(device.id, {
      phase: "idle",
      visibility: "unknown",
      error: null,
      instanceId: null,
      instanceName: null,
      metricsAt: 0,
      receivedAt: 0,
      ...previous,
      ...device,
    });
    this.changed();
    return device;
  }

  connect(
    requestedDevice: CastDevice,
    source: CastSource,
    relaunch = false,
  ): Promise<void> {
    const epoch = this.sourceEpoch;
    return this.runtime
      .runPromise(
        this.lock.withPermit(
          Effect.gen({ self: this }, function* () {
            if (this.disposed || epoch !== this.sourceEpoch)
              return yield* castError("shuttingDown", false);
            const device = this.registerDevice(requestedDevice);
            const previous = this.sessions.get(device.id);
            if (previous) yield* Fiber.interrupt(previous.fiber);
            if (epoch !== this.sourceEpoch)
              return yield* castError("sourceChanged", false);
            const generation = ++this.generation;
            const ready = yield* Deferred.make<undefined, CastError>();
            const fiber = this.runtime.runFork(
              this.workflow(device, source, generation, relaunch, ready),
            );
            this.sessions.set(device.id, { generation, fiber });
            return ready;
          }),
        ),
      )
      .then((ready) => this.runtime.runPromise(Deferred.await(ready)));
  }

  stop(id: string): Promise<void> {
    return this.runtime.runPromise(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* () {
          const active = this.sessions.get(id);
          if (active) yield* Fiber.interrupt(active.fiber);
          this.sessions.delete(id);
          this.patch(id, {
            phase: "idle",
            visibility: "unknown",
            instanceId: null,
            instanceName: null,
            error: null,
            metricsAt: 0,
            receivedAt: 0,
          });
        }),
      ),
    );
  }

  stopAll(): Promise<void> {
    this.sourceEpoch++;
    return this.runtime.runPromise(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* () {
          for (const active of this.sessions.values()) {
            yield* Fiber.interrupt(active.fiber);
          }
          this.sessions.clear();
          for (const device of this.devices.values())
            this.patch(device.id, {
              phase: "idle",
              visibility: "unknown",
              instanceId: null,
              instanceName: null,
              error: null,
              metricsAt: 0,
              receivedAt: 0,
            });
        }),
      ),
    );
  }

  setSettings(settings: DisplaySettings): void {
    this.settings = settings;
    this.changed();
  }

  dispose(): Promise<void> {
    this.disposal ??= this.shutdown();
    return this.disposal;
  }

  private async shutdown(): Promise<void> {
    this.disposed = true;
    await this.stopAll();
    if (this.discovery)
      await this.runtime.runPromise(Fiber.interrupt(this.discovery));
    await this.runtime.dispose();
  }

  private workflow(
    device: CastDevice,
    source: CastSource,
    generation: number,
    relaunch: boolean,
    ready: Deferred.Deferred<undefined, CastError>,
  ): Effect.Effect<void, never, Service> {
    const patch = (state: Partial<CastDeviceState>) => {
      if (this.sessions.get(device.id)?.generation === generation)
        this.patch(device.id, state);
    };
    return Effect.scoped(
      Effect.gen({ self: this }, function* () {
        yield* Effect.yieldNow;
        const metricsSource = yield* MetricsSource;
        const feed = yield* metricsSource.open(source);
        const transport = yield* CastTransport;
        let attempts = 0;
        // Counts sessions that answered a status request, to reset the retry
        // budget. A receiver that closes right after launch never counts.
        let healthySessions = 0;
        const attempt = Effect.scoped(
          Effect.gen({ self: this }, function* () {
            patch({
              phase: attempts++ === 0 ? "connecting" : "reconnecting",
              instanceId: source.instanceId,
              visibility: "unknown",
            });
            const channel = yield* transport.open(
              this.devices.get(device.id) ?? device,
              relaunch && attempts === 1,
            );
            const failure = yield* Deferred.make<never, CastError>();
            yield* Effect.acquireRelease(
              Effect.sync(() =>
                channel.onFailure((error) => {
                  Deferred.doneUnsafe(failure, Effect.fail(error));
                }),
              ),
              (unsubscribe) => Effect.sync(unsubscribe),
            );
            yield* Effect.addFinalizer(() =>
              channel
                .send({
                  type: "RELEASE",
                  requestId: newCastRequestId(),
                  sessionId: channel.sessionId,
                })
                .pipe(Effect.timeout("1 second"), Effect.ignore),
            );
            let sequence = 0;
            let lastTimestamp = -1;
            let lastSettings: DisplaySettings | undefined;
            const updateStatus = (reply: ReceiverMessage) => {
              if (
                reply.type === "STATUS" &&
                reply.sessionId === channel.sessionId
              ) {
                patch({
                  visibility: reply.visibility,
                  receivedAt: reply.receivedAt,
                  metricsAt: reply.metricsAt,
                });
              }
            };
            patch({ phase: "ready", error: null });
            let healthy = false;
            yield* Deferred.succeed(ready, undefined);
            const poll = Effect.gen({ self: this }, function* () {
              if (lastSettings !== this.settings) {
                const settings = this.settings;
                yield* channel.send({
                  type: "SETTINGS",
                  requestId: newCastRequestId(),
                  sessionId: channel.sessionId,
                  settings,
                });
                lastSettings = settings;
              }
              const frame = yield* feed.read.pipe(
                Effect.catchIf(
                  (error) => error.retryable,
                  (error) =>
                    Effect.sync(() => {
                      patch({ error: error.message });
                      return null;
                    }),
                ),
              );
              if (frame)
                patch({ instanceName: frame.instanceInfo.name, error: null });
              const incoming =
                frame?.snapshots.filter(
                  (sample) => sample.timestamp > lastTimestamp,
                ) ?? [];
              if (frame) {
                for (let offset = 0; offset < incoming.length; offset += 20) {
                  const snapshots = incoming.slice(offset, offset + 20);
                  yield* channel.send({
                    type: "METRICS",
                    requestId: newCastRequestId(),
                    sessionId: channel.sessionId,
                    instanceId: source.instanceId,
                    sequence: sequence++,
                    reset: lastTimestamp < 0,
                    snapshots,
                    distributions: frame.distributions,
                    instanceInfo: frame.instanceInfo,
                  });
                  lastTimestamp = snapshots.at(-1)?.timestamp ?? lastTimestamp;
                }
              }
              const status = yield* channel.send({
                type: "PING",
                requestId: newCastRequestId(),
                sessionId: channel.sessionId,
              });
              updateStatus(status);
              if (!healthy) {
                healthy = true;
                healthySessions++;
              }
              yield* Effect.sleep("3 seconds");
            });
            return yield* Effect.raceFirst(
              Effect.forever(poll),
              Deferred.await(failure),
            );
          }),
        );
        // A session that worked earns a fresh retry budget, so occasional
        // network drops over a long cast never add up to a failure.
        let retries = 0;
        for (;;) {
          const healthyBefore = healthySessions;
          const error = yield* Effect.flip(attempt);
          if (healthySessions !== healthyBefore) retries = 0;
          if (!error.retryable || retries >= MAX_RETRIES) return yield* error;
          patch({ phase: "reconnecting", error: error.message });
          yield* Effect.sleep(RETRY_BASE_MS * 2 ** retries++);
        }
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.gen({ self: this }, function* () {
          // Someone on the TV closed our app. That is a normal end, so the
          // display goes back to idle and keeps its project for Show on TV.
          patch(
            error.message === "receiverClosed"
              ? {
                  phase: "idle",
                  error: error.message,
                  visibility: "unknown",
                  metricsAt: 0,
                  receivedAt: 0,
                }
              : {
                  phase: "failed",
                  error: error.message,
                  visibility: "unknown",
                },
          );
          yield* Deferred.fail(ready, error);
        }),
      ),
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        () =>
          Effect.gen(function* () {
            const error = castError("startFailed", false);
            patch({
              phase: "failed",
              error: error.message,
              visibility: "unknown",
            });
            yield* Deferred.fail(ready, error);
          }),
      ),
      Effect.onInterrupt(() =>
        Deferred.fail(ready, castError("canceled", false)),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (this.sessions.get(device.id)?.generation === generation)
            this.sessions.delete(device.id);
        }),
      ),
    );
  }

  private patch(id: string, update: Partial<CastDeviceState>): void {
    const device = this.devices.get(id);
    if (!device) return;
    this.devices.set(id, { ...device, ...update });
    this.changed();
  }

  private changed(): void {
    this.revision++;
    this.publish(this.getState());
  }
}

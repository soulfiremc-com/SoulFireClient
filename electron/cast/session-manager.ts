import { createRequire } from "node:module";
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
  Schedule,
  Semaphore,
} from "effect";
import { castError, type CastError } from "./errors";
import { MetricsSource, MetricsSourceLive } from "./metrics-source";
import { CastTransport, CastTransportLive } from "./transport";

interface ActiveSession {
  readonly generation: number;
  readonly fiber: Fiber.Fiber<void, never>;
}
type Service = CastTransport | MetricsSource;

export class CastSessionManager {
  private readonly runtime: ManagedRuntime.ManagedRuntime<Service, never>;
  private readonly devices = new Map<string, CastDeviceState>();
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly lock = Semaphore.makeUnsafe(1);
  private discovery: Fiber.Fiber<void, never> | undefined;
  private generation = 0;
  private revision = 0;
  private settings: DisplaySettings = DEFAULT_SETTINGS;
  private disposed = false;
  private sourceEpoch = 0;
  private disposal: Promise<void> | undefined;

  constructor(
    private readonly publish: (state: CastState) => void,
    layer: Layer.Layer<Service> = Layer.mergeAll(
      CastTransportLive,
      MetricsSourceLive,
    ),
  ) {
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
    if (this.discovery || this.disposed) return;
    this.discovery = this.runtime.runFork(
      Effect.scoped(
        Effect.gen({ self: this }, function* () {
          type ServiceRecord = {
            name: string;
            host?: string;
            addresses?: string[];
            port: number;
            txt?: Record<string, string>;
          };
          const bonjour = yield* Effect.acquireRelease(
            Effect.try(() => {
              const require = createRequire(__filename);
              const { Bonjour } = require("bonjour-service") as {
                Bonjour: new () => {
                  destroy(): void;
                  find(
                    options: { type: string },
                    callback: (service: ServiceRecord) => void,
                  ): {
                    on(
                      event: "down",
                      callback: (service: ServiceRecord) => void,
                    ): void;
                    stop(): void;
                  };
                };
              };
              return new Bonjour();
            }),
            (service) => Effect.sync(() => service.destroy()),
          );
          const browser = bonjour.find({ type: "googlecast" }, (service) => {
            const id = service.txt?.id;
            const address =
              service.addresses?.find((candidate) => candidate.includes(".")) ??
              service.addresses?.[0] ??
              service.host;
            // Advertised capabilities include video output in bit zero. Do not
            // assume that every compatible TV calls its model "Chromecast".
            if (
              !id ||
              !address ||
              (service.txt?.ca !== undefined &&
                (Number(service.txt.ca) & 1) === 0)
            )
              return;
            this.registerDevice({
              id,
              name: service.txt?.fn ?? service.name,
              address: address.replace(/\.$/, ""),
              port: service.port,
            });
          });
          browser.on("down", (service) => {
            const id = service.txt?.id;
            if (id && !this.sessions.has(id)) {
              this.devices.delete(id);
              this.changed();
            }
          });
          yield* Effect.addFinalizer(() => Effect.sync(() => browser.stop()));
          yield* Effect.never;
        }),
      ).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Cast discovery failed", error),
        ),
      ),
    );
  }

  registerDevice(device: CastDevice): CastDevice {
    const known = Array.from(this.devices.values()).find(
      (candidate) =>
        candidate.address === device.address && candidate.port === device.port,
    );
    if (known) device = { ...device, id: known.id };
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
    device: CastDevice,
    source: CastSource,
    relaunch = false,
  ): Promise<void> {
    const epoch = this.sourceEpoch;
    return this.runtime
      .runPromise(
        this.lock.withPermit(
          Effect.gen({ self: this }, function* () {
            if (this.disposed || epoch !== this.sourceEpoch)
              return yield* Effect.fail(
                castError("Casting is shutting down.", false),
              );
            device = this.registerDevice(device);
            const previous = this.sessions.get(device.id);
            if (previous) yield* Fiber.interrupt(previous.fiber);
            if (epoch !== this.sourceEpoch)
              return yield* Effect.fail(
                castError(
                  "The server connection changed. Connect again.",
                  false,
                ),
              );
            const generation = ++this.generation;
            const ready = yield* Deferred.make<void, CastError>();
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
    ready: Deferred.Deferred<void, CastError>,
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
                  Effect.runSync(Deferred.fail(failure, error));
                }),
              ),
              (unsubscribe) => Effect.sync(unsubscribe),
            );
            yield* Effect.addFinalizer(() =>
              channel
                .send({
                  type: "RELEASE",
                  requestId: crypto.randomUUID(),
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
            yield* Deferred.succeed(ready, undefined);
            const poll = Effect.gen({ self: this }, function* () {
              if (lastSettings !== this.settings) {
                const settings = this.settings;
                yield* channel.send({
                  type: "SETTINGS",
                  requestId: crypto.randomUUID(),
                  sessionId: channel.sessionId,
                  settings,
                });
                lastSettings = settings;
              }
              const frame = yield* feed.read.pipe(
                Effect.catch((error) =>
                  error.retryable
                    ? Effect.sync(() => {
                        patch({ error: error.message });
                        return null;
                      })
                    : Effect.fail(error),
                ),
              );
              if (frame)
                patch({ instanceName: frame.instanceInfo.name, error: null });
              const incoming =
                frame?.snapshots.filter(
                  (sample) => sample.timestamp > lastTimestamp,
                ) ?? [];
              for (
                let offset = 0;
                frame && offset < incoming.length;
                offset += 20
              ) {
                const snapshots = incoming.slice(offset, offset + 20);
                yield* channel.send({
                  type: "METRICS",
                  requestId: crypto.randomUUID(),
                  sessionId: channel.sessionId,
                  instanceId: source.instanceId,
                  sequence: sequence++,
                  reset: lastTimestamp < 0,
                  snapshots,
                  distributions: frame.distributions,
                  instanceInfo: frame.instanceInfo,
                });
                lastTimestamp = snapshots[snapshots.length - 1].timestamp;
              }
              updateStatus(
                yield* channel.send({
                  type: "PING",
                  requestId: crypto.randomUUID(),
                  sessionId: channel.sessionId,
                }),
              );
              yield* Effect.sleep("3 seconds");
            });
            yield* Effect.raceFirst(
              Effect.forever(poll),
              Deferred.await(failure),
            );
          }),
        );
        yield* attempt.pipe(
          Effect.tapError((error) =>
            Effect.sync(() =>
              patch({ phase: "reconnecting", error: error.message }),
            ),
          ),
          Effect.retry({
            times: 5,
            schedule: Schedule.exponential("1 second"),
            while: (error) => error.retryable,
          }),
        );
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.gen({ self: this }, function* () {
          patch({
            phase: "failed",
            error: error.message,
            visibility: "unknown",
          });
          yield* Deferred.fail(ready, error);
        }),
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.gen(function* () {
              const error = castError(
                "Could not start casting. Check the connection settings.",
                false,
              );
              patch({
                phase: "failed",
                error: error.message,
                visibility: "unknown",
              });
              yield* Deferred.fail(ready, error);
            }),
      ),
      Effect.onInterrupt(() =>
        Deferred.fail(
          ready,
          castError("The Cast request was canceled.", false),
        ),
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

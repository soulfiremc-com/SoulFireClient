import { TaggedError as TaggedFailure } from "effect/Schema";
import { createRequire } from "node:module";
import type { CastDevice } from "@soulfiremc/cast-protocol";
import { Context, Deferred, Effect, Layer, Schema } from "effect";

export class CastDiscoveryError extends TaggedFailure<
  CastDiscoveryError,
  { readonly brand: unique symbol }
>()("CastDiscoveryError", {
  cause: Schema.Unknown,
}) {}

export interface ServiceRecord {
  name: string;
  host?: string;
  addresses?: string[];
  port: number;
  txt?: Record<string, string>;
}

// The subset of bonjour-service that discovery uses. `server.mdns` is the
// multicast-dns socket. It emits "error" when it cannot bind port 5353, and
// Node throws an "error" event that has no listener.
interface BonjourBindings {
  readonly server: {
    readonly mdns: {
      on(event: "error", callback: (error: Error) => void): void;
    };
  };
  destroy(): void;
  find(
    options: { type: string },
    callback: (service: ServiceRecord) => void,
  ): {
    on(event: "down", callback: (service: ServiceRecord) => void): void;
    stop(): void;
  };
}

export class CastDiscovery extends Context.Service<
  CastDiscovery,
  {
    /** Reports displays until interrupted, or fails when the socket fails. */
    readonly browse: (handlers: {
      readonly up: (device: CastDevice) => void;
      readonly down: (id: string) => void;
    }) => Effect.Effect<never, CastDiscoveryError>;
  }
>()("soulfire/electron/cast/discovery/CastDiscovery") {}

export const makeCastDiscovery = (loadBonjour: () => BonjourBindings) =>
  Layer.succeed(CastDiscovery, {
    browse: ({ up, down }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const failure = yield* Deferred.make<never, CastDiscoveryError>();
          const bonjour = yield* Effect.acquireRelease(
            Effect.try({
              try: () => {
                const service = loadBonjour();
                service.server.mdns.on("error", (cause) => {
                  Deferred.doneUnsafe(
                    failure,
                    Effect.fail(CastDiscoveryError.make({ cause })),
                  );
                });
                return service;
              },
              catch: (cause) => CastDiscoveryError.make({ cause }),
            }),
            (service) =>
              Effect.sync(() => {
                service.destroy();
              }),
          );
          const browser = yield* Effect.acquireRelease(
            Effect.sync(() =>
              bonjour.find({ type: "googlecast" }, (service) => {
                const id = service.txt?.["id"];
                const address =
                  service.addresses?.find((candidate) =>
                    candidate.includes("."),
                  ) ??
                  service.addresses?.[0] ??
                  service.host;
                // Advertised capabilities include video output in bit zero.
                // Do not assume that every compatible TV calls its model
                // "Chromecast".
                if (
                  !id ||
                  !address ||
                  (service.txt?.["ca"] !== undefined &&
                    (Number(service.txt["ca"]) & 1) === 0)
                )
                  return;
                up({
                  id,
                  name: service.txt?.["fn"] ?? service.name,
                  address: address.replace(/\.$/u, ""),
                  port: service.port,
                });
              }),
            ),
            (found) =>
              Effect.sync(() => {
                found.stop();
              }),
          );
          browser.on("down", (service) => {
            const id = service.txt?.["id"];
            if (id) down(id);
          });
          return yield* Deferred.await(failure);
        }),
      ),
  });

export const CastDiscoveryLive = makeCastDiscovery(() => {
  const require = createRequire(__filename);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bonjour-service is loaded with require, and its public types hide the mdns socket
  const { Bonjour } = require("bonjour-service") as {
    Bonjour: new () => BonjourBindings;
  };
  return new Bonjour();
});

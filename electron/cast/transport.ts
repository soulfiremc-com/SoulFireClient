import { createRequire } from "node:module";
import {
  CAST_APP_ID,
  CAST_NAMESPACE,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  ReceiverMessage,
  payloadBytes,
  type CastDevice,
  type SenderMessage,
} from "@soulfiremc/cast-protocol";
import {
  Context,
  Effect,
  Layer,
  Option,
  Schema,
  Schedule,
  type Scope,
} from "effect";
import { CastError, castError } from "./errors";

type Session = { appId: string; sessionId: string; transportId: string };
type Controller = {
  on(event: "message", callback: (message: unknown) => void): void;
  removeListener(event: "message", callback: (message: unknown) => void): void;
  send(message: unknown): void;
};
type Application = {
  session: Session;
  createController(controller: unknown, namespace: string): Controller;
  on(event: "close", callback: () => void): void;
  close(): void;
};
type Platform = {
  connect(device: { host: string; port: number }, callback: () => void): void;
  close(): void;
  on(event: "error", callback: (error: Error) => void): void;
  removeListener(event: "error", callback: (error: Error) => void): void;
  getSessions(
    callback: (error: Error | null, sessions: Session[]) => void,
  ): void;
  join(
    session: Session,
    application: unknown,
    callback: (error: Error | null, app: Application) => void,
  ): void;
  receiver: {
    request(
      message: unknown,
      callback: (
        error: Error | null,
        response: {
          type: string;
          reason?: string;
          status?: { applications?: Session[] };
        },
      ) => void,
    ): void;
    stop(sessionId: string, callback: (error: Error | null) => void): void;
  };
};

export interface CastChannel {
  readonly sessionId: string;
  readonly send: (
    message: SenderMessage,
  ) => Effect.Effect<ReceiverMessage, CastError>;
  readonly onFailure: (callback: (error: CastError) => void) => () => void;
}

export class CastTransport extends Context.Service<
  CastTransport,
  {
    readonly open: (
      device: CastDevice,
      relaunch: boolean,
    ) => Effect.Effect<CastChannel, CastError, Scope.Scope>;
  }
>()("soulfire/CastTransport") {}

// Keep the callback-based Cast implementation at this boundary. All consumers
// acquire it through an Effect scope, including failed and interrupted opens.
export interface CastBindings {
  Client: new () => Platform;
  Application: new (client: unknown, session: Session) => Application;
  JsonController: unknown;
}

export const makeCastTransport = (loadBindings: () => CastBindings) =>
  Layer.succeed(CastTransport, {
    open: (device, relaunch) =>
      Effect.gen(function* () {
        const cast = loadBindings();
        const client = yield* Effect.acquireRelease(
          Effect.sync(() => new cast.Client()),
          (connection) => Effect.sync(() => connection.close()),
        );
        const failures = new Set<(error: CastError) => void>();
        const pending = new Map<
          string,
          (reply: ReceiverMessage | CastError) => void
        >();
        const sessionId = crypto.randomUUID();
        let app: Application | undefined;
        let controller: Controller | undefined;
        let closed = false;
        let failOpen: ((error: CastError) => void) | undefined;

        const fail = (error: CastError) => {
          if (closed) return;
          failOpen?.(error);
          for (const callback of pending.values()) callback(error);
          pending.clear();
          for (const callback of failures) callback(error);
        };
        const onError = (error: Error) => fail(castError(error.message));
        client.on("error", onError);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            closed = true;
            pending.clear();
            failures.clear();
            // Keep the guarded error listener until the socket is collected.
            // Node sockets can emit one final error after close was requested.
          }),
        );

        const request = (message: SenderMessage) =>
          Effect.callback<ReceiverMessage, CastError>((resume) => {
            if (closed || !controller) {
              resume(Effect.fail(castError("The Cast connection is closed.")));
              return;
            }
            if (payloadBytes(message) > MAX_PAYLOAD_BYTES) {
              resume(
                Effect.fail(
                  castError(
                    "The Cast message exceeds the payload limit.",
                    false,
                  ),
                ),
              );
              return;
            }
            pending.set(message.requestId, (reply) => {
              pending.delete(message.requestId);
              if (reply instanceof CastError) resume(Effect.fail(reply));
              else if (reply.type === "ERROR")
                resume(
                  Effect.fail(
                    castError(reply.message, reply.code === "SESSION_MISMATCH"),
                  ),
                );
              else resume(Effect.succeed(reply));
            });
            try {
              controller.send(message);
            } catch (error) {
              fail(
                castError(
                  error instanceof Error
                    ? error.message
                    : "Could not send the Cast message.",
                ),
              );
            }
            return Effect.sync(() => {
              pending.delete(message.requestId);
            });
          }).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError((error) =>
              error instanceof CastError
                ? error
                : castError("The Cast receiver did not respond."),
            ),
          );

        yield* Effect.callback<void, CastError>((resume, signal) => {
          failOpen = (error) => resume(Effect.fail(error));
          client.connect({ host: device.address, port: device.port }, () => {
            if (signal.aborted || closed) return;
            const launch = () => {
              client.receiver.request(
                {
                  type: "LAUNCH",
                  appId: CAST_APP_ID,
                  relaunchIfRunning: relaunch,
                },
                (error, response) => {
                  if (signal.aborted || closed) return;
                  const session = response?.status?.applications?.find(
                    (entry) => entry.appId === CAST_APP_ID,
                  );
                  if (error || !session) {
                    resume(
                      Effect.fail(
                        castError(
                          error?.message ??
                            `Could not launch Soulfire: ${response?.reason ?? "no receiver session"}.`,
                        ),
                      ),
                    );
                    return;
                  }
                  client.join(
                    session,
                    cast.Application,
                    (joinError, application) => {
                      if (signal.aborted || closed) return;
                      if (joinError) {
                        resume(Effect.fail(castError(joinError.message)));
                        return;
                      }
                      app = application;
                      controller = app.createController(
                        cast.JsonController,
                        CAST_NAMESPACE,
                      );
                      controller.on("message", (payload) => {
                        const reply =
                          Schema.decodeUnknownOption(ReceiverMessage)(payload);
                        if (Option.isSome(reply))
                          pending.get(reply.value.requestId)?.(reply.value);
                      });
                      app.on("close", () =>
                        fail(
                          castError("The Cast receiver closed the session."),
                        ),
                      );
                      resume(Effect.void);
                    },
                  );
                },
              );
            };
            if (!relaunch) {
              launch();
              return;
            }
            // Show on TV performs a controlled restart of our receiver, rather
            // than joining a receiver that the TV has left in the background.
            client.getSessions((error, sessions) => {
              if (signal.aborted || closed) return;
              if (error) {
                resume(Effect.fail(castError(error.message)));
                return;
              }
              const existing = sessions.find(
                (entry) => entry.appId === CAST_APP_ID,
              );
              if (!existing) {
                launch();
                return;
              }
              client.receiver.stop(existing.sessionId, (stopError) => {
                if (signal.aborted || closed) return;
                if (stopError)
                  resume(Effect.fail(castError(stopError.message)));
                else launch();
              });
            });
          });
          return Effect.sync(() => {
            failOpen = undefined;
          });
        }).pipe(
          Effect.timeout("15 seconds"),
          Effect.mapError((error) =>
            error instanceof CastError
              ? error
              : castError("Timed out while launching the Cast receiver."),
          ),
        );

        const ready = yield* Effect.suspend(() =>
          request({
            type: "HELLO",
            requestId: crypto.randomUUID(),
            sessionId,
            version: PROTOCOL_VERSION,
          }).pipe(
            Effect.timeout("3 seconds"),
            Effect.mapError((error) =>
              error instanceof CastError
                ? error
                : castError("The Cast receiver is still starting."),
            ),
          ),
        ).pipe(
          Effect.retry({
            times: 2,
            schedule: Schedule.spaced("500 millis"),
            while: (error) => error.retryable,
          }),
        );
        if (
          ready.type !== "READY" ||
          ready.version !== PROTOCOL_VERSION ||
          ready.sessionId !== sessionId
        ) {
          return yield* Effect.fail(
            castError(
              "Update both Soulfire and the Cast receiver to compatible versions.",
              false,
            ),
          );
        }
        return {
          sessionId,
          send: request,
          onFailure: (callback) => {
            failures.add(callback);
            return () => {
              failures.delete(callback);
            };
          },
        };
      }),
  });

export const CastTransportLive = makeCastTransport(() => {
  const require = createRequire(__filename);
  return require("castv2-client") as CastBindings;
});

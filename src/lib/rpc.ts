import type {
  DescMessage,
  DescMethodServerStreaming,
  DescMethodUnary,
  DescService,
  MessageInitShape,
  MessageShape,
} from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createClient,
  makeAnyClient,
  type CallOptions,
  type Transport,
} from "@connectrpc/connect";
import { Cause, Effect, Stream } from "effect";

// Adapted from SoulFire's Effect SDK transport, retaining ConnectError for UI callers.
// https://github.com/soulfiremc-com/SoulFire/blob/53aa92514f4174fdee4861c6bfd2059dca0148d1/sdk/typescript/src/transport.ts

export type RpcClient<S extends DescService> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary<
    infer I,
    infer O
  >
    ? (
        request: MessageInitShape<I>,
        options?: CallOptions,
      ) => Effect.Effect<MessageShape<O>, ConnectError>
    : S["method"][K] extends DescMethodServerStreaming<infer I, infer O>
      ? (
          request: MessageInitShape<I>,
          options?: CallOptions,
        ) => Stream.Stream<MessageShape<O>, ConnectError>
      : never;
};

/** Keeps generated service types while exposing Effect calls and streams. */
export function createRpcClient<S extends DescService>(
  service: S,
  transport: Transport,
): RpcClient<S> {
  const client = createClient(service, transport);
  return makeAnyClient(service, (method) => {
    const operation = `${service.typeName}/${method.name}`;
    // The descriptor selects the method's signature after indexing by its local name.
    if (method.methodKind === "unary") {
      const call = client[method.localName] as (
        request: MessageInitShape<DescMessage>,
        options?: CallOptions,
      ) => Promise<MessageShape<DescMessage>>;
      return (request: MessageInitShape<DescMessage>, options?: CallOptions) =>
        rpc(operation, (signal) => call(request, withSignal(options, signal)));
    }
    if (method.methodKind === "server_streaming") {
      const call = client[method.localName] as (
        request: MessageInitShape<DescMessage>,
        options?: CallOptions,
      ) => AsyncIterable<MessageShape<DescMessage>>;
      return (request: MessageInitShape<DescMessage>, options?: CallOptions) =>
        rpcStream(operation, (signal) =>
          call(request, withSignal(options, signal)),
        );
    }
    throw new ConnectError(
      `Unsupported browser RPC method: ${operation}`,
      Code.Unimplemented,
    );
  }) as RpcClient<S>;
}

/** Converts a Connect unary call into a lazy, interruptible Effect. */
export function rpc<A>(
  operation: string,
  call: (signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, ConnectError> {
  return Effect.tryPromise({
    try: call,
    catch: ConnectError.from,
  }).pipe(Effect.withSpan(operation));
}

/** Acquires a fresh Connect subscription for each stream consumer. */
export function rpcStream<A>(
  operation: string,
  call: (signal: AbortSignal) => AsyncIterable<A>,
): Stream.Stream<A, ConnectError> {
  return Stream.unwrap(
    Effect.acquireRelease(
      Effect.try({
        try: () => {
          const controller = new AbortController();
          const iterator = call(controller.signal)[Symbol.asyncIterator]();
          return { controller, iterator };
        },
        catch: ConnectError.from,
      }),
      ({ controller, iterator }) =>
        Effect.gen(function* () {
          // Abort pending next() before awaiting an async generator's return().
          controller.abort();
          if (iterator.return !== undefined) {
            yield* Effect.tryPromise({
              try: () => iterator.return!(),
              catch: ConnectError.from,
            }).pipe(Effect.ignore);
          }
        }),
    ).pipe(
      Effect.map(({ iterator }) =>
        Stream.fromEffectRepeat(
          Effect.tryPromise({
            try: () => iterator.next(),
            catch: ConnectError.from,
          }).pipe(
            Effect.flatMap((result) =>
              result.done ? Cause.done() : Effect.succeed(result.value),
            ),
          ),
        ),
      ),
    ),
  ).pipe(Stream.withSpan(operation));
}

export function withSignal(
  options: CallOptions | undefined,
  signal: AbortSignal,
): CallOptions {
  return {
    ...options,
    signal:
      options?.signal === undefined
        ? signal
        : AbortSignal.any([options.signal, signal]),
  };
}

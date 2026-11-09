import type { Client } from "@connectrpc/connect";
import { Context, Data, Effect, Layer, Stream } from "effect";
import type { LogScope, LogsService } from "@/generated/soulfire/logs_pb";

export type LogClient = Pick<
  Client<typeof LogsService>,
  "getPrevious" | "subscribe"
>;
type LogResponse =
  ReturnType<LogClient["subscribe"]> extends AsyncIterable<infer A> ? A : never;

export class TerminalLogError extends Data.TaggedError("TerminalLogError")<{
  readonly operation: "history" | "subscribe";
  readonly cause: unknown;
}> {}

export class TerminalLogs extends Context.Service<
  TerminalLogs,
  {
    readonly history: Effect.Effect<
      Awaited<ReturnType<LogClient["getPrevious"]>>,
      TerminalLogError
    >;
    readonly live: Stream.Stream<LogResponse, TerminalLogError>;
  }
>()("terminal/Logs") {}

export function terminalLogsLayer(client: LogClient, scope: LogScope) {
  return Layer.succeed(TerminalLogs, {
    history: Effect.tryPromise({
      try: (signal) => client.getPrevious({ scope, count: 300 }, { signal }),
      catch: (cause) => new TerminalLogError({ operation: "history", cause }),
    }),
    live: Stream.fromAsyncIterable(
      {
        [Symbol.asyncIterator]() {
          const controller = new AbortController();
          const iterator = client
            .subscribe({ scope }, { signal: controller.signal })
            [Symbol.asyncIterator]();
          return {
            next: () => iterator.next(),
            return: () => {
              // Abort before iterator.return(): a Connect stream can be waiting in next().
              controller.abort();
              return (
                iterator.return?.() ??
                Promise.resolve({ done: true as const, value: undefined })
              );
            },
          };
        },
      },
      (cause) => new TerminalLogError({ operation: "subscribe", cause }),
    ),
  });
}

import { Context, Data, Effect, Layer, Stream } from "effect";
import type {
  LogResponse,
  LogScope,
  LogsService,
  PreviousLogResponse,
} from "@/generated/soulfire/logs_pb";
import type { RpcClient } from "@/lib/rpc";

export type LogClient = Pick<
  RpcClient<typeof LogsService>,
  "getPrevious" | "subscribe"
>;

export class TerminalLogError extends Data.TaggedError("TerminalLogError")<{
  readonly operation: "history" | "subscribe";
  readonly cause: unknown;
}> {}

export class TerminalLogs extends Context.Service<
  TerminalLogs,
  {
    readonly history: Effect.Effect<PreviousLogResponse, TerminalLogError>;
    readonly live: Stream.Stream<LogResponse, TerminalLogError>;
  }
>()("terminal/Logs") {}

export function terminalLogsLayer(client: LogClient, scope: LogScope) {
  return Layer.succeed(TerminalLogs, {
    history: client
      .getPrevious({ scope, count: 300 })
      .pipe(
        Effect.mapError(
          (cause) => new TerminalLogError({ operation: "history", cause }),
        ),
      ),
    live: client
      .subscribe({ scope })
      .pipe(
        Stream.mapError(
          (cause) => new TerminalLogError({ operation: "subscribe", cause }),
        ),
      ),
  });
}

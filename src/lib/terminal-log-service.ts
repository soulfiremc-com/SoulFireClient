import { TaggedError as TaggedFailure } from "effect/Schema";
import { Context, Schema, Effect, Layer, Stream } from "effect";
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

export class TerminalLogError extends TaggedFailure<
  TerminalLogError,
  { readonly brand: unique symbol }
>()("TerminalLogError", {
  operation: Schema.Literals(["history", "subscribe"]),
  cause: Schema.Unknown,
}) {}

export class TerminalLogs extends Context.Service<
  TerminalLogs,
  {
    readonly history: Effect.Effect<PreviousLogResponse, TerminalLogError>;
    readonly live: Stream.Stream<LogResponse, TerminalLogError>;
  }
>()("soulfire/lib/terminal-log-service/TerminalLogs") {}

export function terminalLogsLayer(client: LogClient, scope: LogScope) {
  return Layer.succeed(TerminalLogs, {
    history: client
      .getPrevious({ scope, count: 300 })
      .pipe(
        Effect.mapError((cause) =>
          TerminalLogError.make({ operation: "history", cause }),
        ),
      ),
    live: client
      .subscribe({ scope })
      .pipe(
        Stream.mapError((cause) =>
          TerminalLogError.make({ operation: "subscribe", cause }),
        ),
      ),
  });
}

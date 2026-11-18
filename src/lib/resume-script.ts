import { createRpcClient } from "@/lib/rpc";
import type { Transport } from "@connectrpc/connect";
import { Data, Effect, Stream } from "effect";
import { ScriptService } from "@/generated/soulfire/script_pb";

class ScriptActivationError extends Data.TaggedError("ScriptActivationError")<{
  readonly message: string;
}> {}

export async function resumeScript(
  transport: Transport,
  instanceId: string,
  scriptId: string,
): Promise<void> {
  await Effect.runPromise(
    Effect.gen(function* () {
      const client = createRpcClient(ScriptService, transport);
      // Closing the monitoring stream after confirmation leaves the script running.
      const started = yield* client
        .activateScript({ instanceId, scriptId })
        .pipe(
          Stream.filter((event) => event.event.case === "scriptStarted"),
          Stream.take(1),
          Stream.runCollect,
        );
      if (started.length === 0)
        return yield* new ScriptActivationError({
          message: "The server ended script activation without confirming it.",
        });
      return undefined;
    }),
  );
}

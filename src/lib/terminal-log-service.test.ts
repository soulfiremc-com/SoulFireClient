import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { createRpcClient } from "@/lib/rpc";
import { Effect, Stream } from "effect";
import {
  LogScopeSchema,
  LogsService,
  LogStringSchema,
} from "@/generated/soulfire/logs_pb";
import { TerminalLogs, terminalLogsLayer } from "./terminal-log-service";

const scope = create(LogScopeSchema, { scope: { case: "global", value: {} } });

test("a finite stream consumer aborts the underlying Connect subscription", async () => {
  let aborted = false;
  const transport = createRouterTransport((router) =>
    router.service(LogsService, {
      getPrevious: () => ({ messages: [] }),
      async *subscribe(_, context) {
        context.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
          },
          { once: true },
        );
        yield {
          message: create(LogStringSchema, { id: "1", message: "Started" }),
        };
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
      },
    }),
  );
  const layer = terminalLogsLayer(
    createRpcClient(LogsService, transport),
    scope,
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const logs = yield* TerminalLogs;
      yield* logs.live.pipe(Stream.take(1), Stream.runDrain);
    }).pipe(Effect.provide(layer)),
  );
  assert.equal(aborted, true);
});

test("history failures retain a typed operation at the RPC adapter", async () => {
  const transport = createRouterTransport((router) =>
    router.service(LogsService, {
      getPrevious: () => {
        throw new Error("Service unavailable");
      },
    }),
  );
  const result = await Effect.runPromise(
    Effect.result(
      Effect.flatMap(TerminalLogs, (logs) => logs.history).pipe(
        Effect.provide(
          terminalLogsLayer(createRpcClient(LogsService, transport), scope),
        ),
      ),
    ),
  );
  assert.equal(result._tag, "Failure");
  if (result._tag === "Failure") {
    assert.equal(result.failure._tag, "TerminalLogError");
    assert.equal(result.failure.operation, "history");
  }
});

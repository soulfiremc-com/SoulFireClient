import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createRouterTransport } from "@connectrpc/connect";
import type { LogEntry } from "@/components/script-editor/types";
import { LogsService } from "@/generated/soulfire/logs_pb";
import { mergeExecutionLogs, watchScriptLogs } from "./script-logs";

const entry = (id: number): LogEntry => ({
  id: String(id),
  timestamp: new Date(id),
  level: "info",
  nodeId: null,
  message: "",
});

test("late history merges in order without duplicating live entries or displacing newer events", () => {
  const live = Array.from({ length: 500 }, (_, index) => entry(index + 100));
  const history = Array.from({ length: 200 }, (_, index) => entry(index));
  const merged = mergeExecutionLogs(live, history);
  assert.equal(merged.length, 500);
  assert.equal(merged[0], live[0]);
  assert.equal(merged[499], live[499]);
  assert.equal(mergeExecutionLogs(merged, [live[20]]), merged);
  assert.deepEqual(
    mergeExecutionLogs([entry(4), entry(4)], [entry(2), entry(3)]).map(
      (log) => log.id,
    ),
    ["2", "3", "4"],
  );
});

test("script log feed reconciles history and live messages and retains repeated messages", async () => {
  const warning = {
    id: "warning",
    level: "WARNING",
    message: "\u001b[33mRepeated message\u001b[0m",
    timestamp: { seconds: 1n },
  };
  const error = {
    ...warning,
    id: "error",
    level: "FATAL",
    timestamp: { seconds: 2n },
  };
  let sendNext = () => {};
  const nextMessage = new Promise<void>((resolve) => {
    sendNext = resolve;
  });
  let signal: AbortSignal | undefined;
  const transport = createRouterTransport(
    (router) => {
      router.service(LogsService, {
        getPrevious(request) {
          assert.equal(request.scope?.scope.case, "instanceScript");
          return { messages: [warning] };
        },
        async *subscribe() {
          yield { message: warning };
          yield { message: error };
          await nextMessage;
          yield {
            message: { ...warning, id: "next", timestamp: { seconds: 3n } },
          };
        },
      });
    },
    {
      transport: {
        interceptors: [
          (next) => (request) => {
            if (request.stream) signal = request.signal;
            return next(request);
          },
        ],
      },
    },
  );
  let logs: LogEntry[] = [];
  const stop = watchScriptLogs(transport, "instance", "script", (incoming) => {
    logs = mergeExecutionLogs(logs, incoming);
  });
  try {
    await delay(150);
    assert.deepEqual(
      logs.map((log) => log.id),
      ["warning", "error"],
    );
    assert.deepEqual(
      logs.map((log) => log.level),
      ["warn", "error"],
    );
    assert.deepEqual(
      logs.map((log) => log.timestamp.getTime()),
      [1000, 2000],
    );
    assert.ok(logs.every((log) => log.message === "Repeated message"));
    logs = [];
    sendNext();
    await delay(100);
    assert.deepEqual(
      logs.map((log) => log.id),
      ["next"],
    );
  } finally {
    stop();
  }
  assert.equal(signal?.aborted, true);
});

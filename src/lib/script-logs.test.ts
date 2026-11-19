import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createRouterTransport } from "@connectrpc/connect";
import type { LogEntry } from "@/components/script-editor/types";
import { LogsService } from "@/generated/soulfire/logs_pb";
import { mergeExecutionLogs, watchScriptLogs } from "./script-logs";
import { assertDefined } from "@/lib/assert-defined";

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
  const replayed = live[20];
  assert.ok(replayed);
  assert.equal(mergeExecutionLogs(merged, [replayed]), merged);
  assert.deepEqual(
    mergeExecutionLogs([entry(4), entry(4)], [entry(2), entry(3)]).map(
      (log) => log.id,
    ),
    ["2", "3", "4"],
  );
});

let sendNext = () => {};
let release = () => {};
let ready = () => {};

test("script log feed reconciles history and live messages and retains repeated messages", async () => {
  const warning = {
    id: "warning",
    level: "WARNING",
    message: "\u001B[33mRepeated message\u001B[0m",
    timestamp: { seconds: 1n },
  };
  const error = {
    ...warning,
    id: "error",
    level: "FATAL",
    timestamp: { seconds: 2n },
  };
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

test("script feed retains independent provenance and strips untrusted interaction strings", async () => {
  const { encodeTerminalInteraction: marker, parseTerminalText } =
    await import("./terminal-interactions");
  const text = `${marker({
    hover: "Details",
    click: { action: "copy_to_clipboard", value: "fixture-token" },
  })}Copy token${marker(null)}`;
  const messages = [
    {
      id: "trusted",
      personal: true,
      terminalInteractions: true,
      message: text,
    },
    {
      id: "raw-personal",
      personal: true,
      terminalInteractions: false,
      message: text,
    },
    {
      id: "nonpersonal",
      personal: false,
      terminalInteractions: true,
      message: text,
    },
    {
      id: "legacy",
      personal: false,
      message: "\u001B[31mLegacy\u001B[0m\u001B]777;soulfire;1;unfinished",
    },
  ];
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = createRouterTransport((router) => {
    router.service(LogsService, {
      getPrevious: () => ({ messages }),
      async *subscribe() {
        yield { message: messages[0] };
        await pending;
      },
    });
  });
  let logs: LogEntry[] = [];
  const received = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const stop = watchScriptLogs(transport, "instance", "script", (incoming) => {
    logs = mergeExecutionLogs(logs, incoming);
    if (logs.length === 4) ready();
  });
  try {
    await Promise.race([
      received,
      delay(2000).then(() => {
        throw new Error("Log snapshot did not arrive");
      }),
    ]);
    const trusted = assertDefined(
      logs.find((log) => log.id === "trusted"),
      "Expected logs.find((log) => log.id === trusted) to exist",
    );
    assert.equal(trusted.personal, true);
    assert.equal(trusted.terminalInteractions, true);
    assert.equal(trusted.message, text);
    assert.equal(
      parseTerminalText(trusted)[0]?.interaction?.click?.value,
      "fixture-token",
    );
    for (const id of ["raw-personal", "nonpersonal"]) {
      const log = assertDefined(
        logs.find((candidate) => candidate.id === id),
        "Expected logs.find((candidate) => candidate.id === id) to exist",
      );
      assert.equal(log.message, "Copy token");
      assert.ok(parseTerminalText(log).every((span) => !span.interaction));
    }
    assert.equal(
      assertDefined(
        logs.find((log) => log.id === "nonpersonal"),
        "Expected logs.find((log) => log.id === nonpersonal) to exist",
      ).personal,
      false,
    );
    assert.equal(
      assertDefined(
        logs.find((log) => log.id === "nonpersonal"),
        "Expected logs.find((log) => log.id === nonpersonal) to exist",
      ).terminalInteractions,
      true,
    );
    assert.equal(
      assertDefined(
        logs.find((log) => log.id === "legacy"),
        "Expected logs.find((log) => log.id === legacy) to exist",
      ).message,
      "Legacy",
    );
  } finally {
    stop();
    release();
  }
});

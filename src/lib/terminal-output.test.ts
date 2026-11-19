import assert from "node:assert/strict";
import { test } from "node:test";
import { WasmBridge, type TerminalCore } from "@wterm/dom";
import { toTerminalLine } from "@/stores/terminal-log-store";
import { createTerminalOutput, formatTerminalLine } from "./terminal-output";

function line(id: string, message = id) {
  return toTerminalLine({ id, message, personal: false });
}

async function terminal(cols = 80, rows = 4) {
  const bridge = await WasmBridge.load();
  bridge.init(cols, rows);
  return {
    bridge,
    write: (data: string | Uint8Array) => {
      if (typeof data === "string") bridge.writeString(data);
      else bridge.writeRaw(data);
    },
  };
}

function text(core: TerminalCore) {
  const history = core.getScrollbackCount();
  return Array.from({ length: history + core.getRows() }, (_, row) => {
    const cell = (col: number) =>
      row < history
        ? core.getScrollbackCell(history - row - 1, col)
        : core.getCell(row - history, col);
    return Array.from({ length: core.getCols() }, (_cell, col) => {
      const value = cell(col);
      return (
        value.chars ?? (value.char ? String.fromCodePoint(value.char) : " ")
      );
    })
      .join("")
      .trimEnd();
  })
    .join("\n")
    .trimEnd();
}

test("metadata retains its labels, localized time, and severity color", () => {
  const timestamp = {
    $typeName: "google.protobuf.Timestamp" as const,
    seconds: 0n,
    nanos: 0,
  };
  assert.equal(
    formatTerminalLine(
      {
        ...line("1", "message"),
        level: "WARN",
        timestamp,
        instanceName: "Test",
        botAccountName: "Bot",
        loggerName: "com.soulfiremc.server.Logger",
      },
      "en-US",
    ),
    `\u001B[0m\u001B[33mWARN ${new Date(0).toLocaleTimeString("en-US")} Test:Bot Logger\u001B[0m message\u001B[0m\r\n`,
  );
  assert.equal(
    formatTerminalLine(line("1", "message\n")),
    "\u001B[0mmessage\r\n\u001B[0m",
  );
  assert.equal(
    formatTerminalLine(line("1", "message\n\u001B[0m")),
    "\u001B[0mmessage\r\n\u001B[0m\u001B[0m",
  );
});

test("ANSI colors survive without allowing logs to alter terminal state", async () => {
  const term = await terminal();
  const output = createTerminalOutput(term);
  output.sync([
    line("1", "keep"),
    line(
      "2",
      "\u001B[2J\u001B[H\u001B[?1049h\u001B]52;c;bad\u0007\u001B[31mred\u001B[0m\u0008!",
    ),
    line("3", "plain"),
  ]);
  assert.equal(text(term.bridge), "keep\nred!\nplain");
  assert.equal(term.bridge.getCell(1, 0).fg, 1);
  assert.equal(term.bridge.getCell(2, 0).fg, 256);
  assert.equal(term.bridge.usingAltScreen(), false);
  assert.equal(term.bridge.getCursor().visible, false);
});

test("unfinished escapes and control strings cannot consume the next log", async () => {
  const term = await terminal();
  const output = createTerminalOutput(term);
  output.sync([
    line("1", "first\u001B]52;c;unfinished"),
    line("2", "second\u001B[31"),
    line("3", "third\u001BPignored\u001B\\!"),
  ]);
  assert.equal(text(term.bridge), "first\nsecond\nthird!");
});

test("multiline messages start at column zero and reset their colors", async () => {
  const term = await terminal();
  createTerminalOutput(term).sync([
    line("1", "\u001B[32mfirst\r\nsecond\n"),
    line("2", "third"),
  ]);
  assert.equal(text(term.bridge), "first\nsecond\nthird");
  assert.equal(term.bridge.getCell(2, 0).fg, 256);
});

test("appending avoids replay, while history insertion and replacement reconcile", async () => {
  const term = await terminal();
  const output = createTerminalOutput(term);
  const a = line("a");
  const b = line("b");
  const c = line("c");
  output.sync([b]);
  assert.equal(output.sync([b, c]).reset, false);
  assert.equal(output.sync([a, b, c]).reset, true);
  assert.equal(text(term.bridge), "a\nb\nc");
  output.sync([line("b", "corrected"), c]);
  assert.equal(text(term.bridge), "corrected\nc");
  output.sync([line("other scope")]);
  assert.equal(text(term.bridge), "other scope");
  output.sync([]);
  assert.equal(text(term.bridge), "");
});

test("rollover discards evicted logs and returns the retained row movement", async () => {
  const term = await terminal();
  const output = createTerminalOutput(term);
  let entries = Array.from({ length: 500 }, (_, id) => line(String(id)));
  output.sync(entries);
  for (let id = 500; id < 510; id++) {
    entries = [...entries.slice(1), line(String(id))];
    assert.deepEqual(output.sync(entries), { reset: true, rowShift: -1 });
  }
  assert.equal(
    text(term.bridge),
    entries.map((entry) => entry.message).join("\n"),
  );
});

test("resizing replays source messages so wrapped text is not truncated", async () => {
  const term = await terminal(20);
  const output = createTerminalOutput(term);
  const entries = [line("1", "abcdefghijklmnop")];
  output.sync(entries);
  term.bridge.resize(8, 4);
  output.sync(entries, undefined, true);
  assert.equal(text(term.bridge), "abcdefgh\nijklmnop");
  term.bridge.resize(20, 4);
  output.sync(entries, undefined, true);
  assert.equal(text(term.bridge), "abcdefghijklmnop");
});

test("viewport movement accounts for the core's physical scrollback limit", async () => {
  const term = await terminal(10);
  const output = createTerminalOutput(term);
  const entries = Array.from({ length: 500 }, (_, id) =>
    line(String(id), `${id} ${"x".repeat(40)}`),
  );
  output.sync(entries);
  assert.ok(term.bridge.getScrollbackDiscardedCount() > 0);
  // Both buffers exceed the physical row limit, so removing one oldest entry
  // does not move the surviving visible rows.
  assert.equal(output.sync(entries.slice(1)).rowShift, 0);
});

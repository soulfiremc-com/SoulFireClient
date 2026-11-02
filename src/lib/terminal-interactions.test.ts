import assert from "node:assert/strict";
import { test } from "node:test";
import { WasmBridge } from "@wterm/dom";
import { toTerminalLine } from "@/stores/terminal-log-store";
import { createTerminalOutput, formatTerminalLine } from "./terminal-output";
import {
  terminalInteractionAt,
  visibleTerminalInteractions,
} from "./terminal-interaction-cells";
import {
  encodeTerminalInteraction as marker,
  terminalLogText,
  type TerminalInteraction,
} from "./terminal-interactions";

const metadata: TerminalInteraction = {
  hover: "Héllo 🌍",
  click: { action: "run_command", value: "help" },
};
const message = marker(metadata) + "Click" + marker(null);
const line = (id: string, text = message, personal = true, trusted = true) =>
  toTerminalLine({
    id,
    message: text,
    personal,
    terminalInteractions: trusted,
  });

async function setup(cols = 20, rows = 3) {
  const bridge = await WasmBridge.load();
  bridge.init(cols, rows);
  const output = createTerminalOutput({
    bridge,
    write: (data) =>
      typeof data === "string"
        ? bridge.writeString(data)
        : bridge.writeRaw(data),
  });
  return { bridge, output };
}

test("both protobuf trust flags are required, including for personal raw strings", async () => {
  const { bridge, output } = await setup();
  for (const [personal, trusted] of [
    [false, false],
    [false, true],
    [true, false],
  ]) {
    output.sync([line("1", message, personal, trusted)]);
    assert.equal(output.interactions.size, 0);
    assert.equal(bridge.getCell(0, 0).linkUri, undefined);
    assert.equal(bridge.getCell(0, 0).char, 67);
  }
  output.sync([line("2")]);
  assert.equal(output.interactions.size, 1);
  assert.deepEqual(
    output.interactions.get(bridge.getCell(0, 0).linkUri!),
    metadata,
  );
  // Plain fallback rendering must not expose control strings or actions.
  assert.equal(formatTerminalLine(line("2")), "\x1b[0mClick\x1b[0m\r\n");
});

test("wire fixture preserves UTF-8 and matches the Java encoder contract", () => {
  const fixture =
    "\x1b]777;soulfire;1;eyJob3ZlciI6IkjDqWxsbyDwn4yNIiwiY2xpY2siOnsiYWN0aW9uIjoicnVuX2NvbW1hbmQiLCJ2YWx1ZSI6ImhlbHAifX0\x1b\\";
  assert.equal(marker(metadata), fixture);
  let parsed: TerminalInteraction | undefined;
  terminalLogText(fixture + "visible", true, (value) => {
    parsed = value;
    return "test:1";
  });
  assert.deepEqual(parsed, metadata);
});

test("unknown, malformed, oversized and unsafe markers end active metadata", () => {
  const raw = (payload: unknown, version = "1") =>
    `\x1b]777;soulfire;${version};${Buffer.from(JSON.stringify(payload)).toString("base64url").replace(/=/g, "")}\x1b\\`;
  const invalid = [
    "\x1b]777;soulfire;1;%%%\x1b\\",
    raw(metadata, "2"),
    raw(null),
    raw([]),
    raw({ hover: "x".repeat(4097) }),
    raw({ hover: "\x1b[2J" }),
    raw({ click: { action: "run_command", value: "help\nstop" } }),
    raw({ click: { action: "open_file", value: "/tmp" } }),
    ...[
      "javascript:alert(1)",
      "file:///tmp",
      "data:text/plain,hi",
      "https://user:pass@example.com",
    ].map((value) => raw({ click: { action: "open_url", value } })),
    "\x1b]777;soulfire;1;" + "a".repeat(16385) + "\x1b\\",
  ];
  for (const value of invalid) {
    let registrations = 0;
    const text = terminalLogText(
      marker(metadata) + "A" + value + "B",
      true,
      () => `test:${registrations++}`,
    );
    assert.equal(registrations, 1);
    assert.ok(text.includes("A\x1b]8;;\x1b\\B"));
  }
  assert.equal(
    terminalLogText("before\x1b]777;soulfire;1;unfinished"),
    "before",
  );
  assert.equal(
    terminalLogText(
      "\x1b]52;c;clipboard\x07\x1b]8;;https://example.com\x1b\\text\x1b]8;;\x1b\\\x1b[2J",
    ),
    "text",
  );
});

test("cell identities survive wide glyphs, wrapping, history, replay, and append", async () => {
  const { bridge, output } = await setup(5, 2);
  const first = line(
    "1",
    marker(metadata) + "A界e\u0301XYZ" + marker(null) + " plain",
  );
  const second = line("2", "next");
  output.sync([first]);
  const uri = [...output.interactions.keys()][0];
  const runs = visibleTerminalInteractions(bridge, output.interactions, 0, 20);
  assert.equal(runs.map((run) => run.text).join(""), "A界e\u0301XYZ");
  assert.equal(
    runs.reduce((sum, run) => sum + run.width, 0),
    7,
  );
  assert.ok(runs.length >= 2);
  assert.equal(terminalInteractionAt(bridge, runs[0].row, runs[0].col), uri);
  assert.equal(terminalInteractionAt(bridge, -1, 0), undefined);
  assert.equal(terminalInteractionAt(bridge, 0, -1), undefined);
  output.sync([first, second]);
  assert.equal(output.interactions.size, 1);
  assert.equal(
    bridge.getCell(bridge.getCursor().row - 1, 0).linkUri,
    undefined,
  );
  bridge.resize(12, 3);
  output.sync([first, second], undefined, true);
  assert.equal(
    visibleTerminalInteractions(bridge, output.interactions, 0, 20)
      .map((run) => run.text)
      .join(""),
    "A界e\u0301XYZ",
  );
  output.sync([second]);
  assert.equal(output.interactions.size, 0);
  assert.equal(
    visibleTerminalInteractions(bridge, output.interactions, 0, 20).length,
    0,
  );
});

test("span count is bounded without dropping visible text", () => {
  let registrations = 0;
  const text = terminalLogText(
    (marker(metadata) + "x" + marker(null)).repeat(70),
    true,
    () => `test:${registrations++}`,
  );
  assert.equal(registrations, 64);
  assert.equal((text.match(/x/g) ?? []).length, 70);
});

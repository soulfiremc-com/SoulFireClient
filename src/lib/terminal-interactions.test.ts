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
  parseTerminalText,
  type TerminalInteraction,
} from "./terminal-interactions";
import { assertDefined } from "@/lib/assert-defined";

const metadata: TerminalInteraction = {
  hover: "Héllo 🌍",
  click: { action: "run_command", value: "help" },
};
const message = `${marker(metadata)}Click${marker(null)}`;
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
    write: (data) => {
      if (typeof data === "string") bridge.writeString(data);
      else bridge.writeRaw(data);
    },
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
    output.interactions.get(
      assertDefined(
        bridge.getCell(0, 0).linkUri,
        "Expected bridge.getCell(0, 0).linkUri to exist",
      ),
    ),
    metadata,
  );
  // Plain fallback rendering must not expose control strings or actions.
  assert.equal(formatTerminalLine(line("2")), "\u001B[0mClick\u001B[0m\r\n");
});

test("wire fixture preserves UTF-8 and matches the Java encoder contract", () => {
  const fixture =
    "\u001B]777;soulfire;1;eyJob3ZlciI6IkjDqWxsbyDwn4yNIiwiY2xpY2siOnsiYWN0aW9uIjoicnVuX2NvbW1hbmQiLCJ2YWx1ZSI6ImhlbHAifX0\u001B\\";
  assert.equal(marker(metadata), fixture);
  let parsed: TerminalInteraction | undefined;
  terminalLogText(`${fixture}visible`, true, (value) => {
    parsed = value;
    return "test:1";
  });
  assert.deepEqual(parsed, metadata);
});

const raw = (payload: unknown, version = "1") =>
  `\u001B]777;soulfire;${version};${Buffer.from(JSON.stringify(payload)).toString("base64url").replaceAll("=", "")}\u001B\\`;

test("unknown, malformed, oversized and unsafe markers end active metadata", () => {
  const invalid = [
    "\u001B]777;soulfire;1;%%%\u001B\\",
    raw(metadata, "2"),
    raw(null),
    raw([]),
    raw({ hover: "x".repeat(4097) }),
    raw({ hover: "\u001B[2J" }),
    raw({ click: { action: "run_command", value: "help\nstop" } }),
    raw({ click: { action: "open_file", value: "/tmp" } }),
    ...[
      // oxlint-disable-next-line eslint/no-script-url -- Verify that script URLs are rejected.
      "javascript:alert(1)",
      "file:///tmp",
      "data:text/plain,hi",
      "https://user:pass@example.com",
    ].map((value) => raw({ click: { action: "open_url", value } })),
    `\u001B]777;soulfire;1;${"a".repeat(16_385)}\u001B\\`,
  ];
  for (const value of invalid) {
    let registrations = 0;
    const text = terminalLogText(
      `${marker(metadata)}A${value}B`,
      true,
      () => `test:${registrations++}`,
    );
    assert.equal(registrations, 1);
    assert.ok(text.includes("A\u001B]8;;\u001B\\B"));
  }
  assert.equal(
    terminalLogText("before\u001B]777;soulfire;1;unfinished"),
    "before",
  );
  assert.equal(
    terminalLogText(
      "\u001B]52;c;clipboard\u0007\u001B]8;;https://example.com\u001B\\text\u001B]8;;\u001B\\\u001B[2J",
    ),
    "text",
  );
});

test("cell identities survive wide glyphs, wrapping, history, replay, and append", async () => {
  const { bridge, output } = await setup(5, 2);
  const first = line(
    "1",
    `${marker(metadata)}A界e\u0301XYZ${marker(null)} plain`,
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
  const [firstRun] = runs;
  assert.ok(firstRun);
  assert.equal(terminalInteractionAt(bridge, firstRun.row, firstRun.col), uri);
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
    `${marker(metadata)}x${marker(null)}`.repeat(70),
    true,
    () => `test:${registrations++}`,
  );
  assert.equal(registrations, 64);
  assert.equal((text.match(/x/gu) ?? []).length, 70);
});

test("renderer-independent spans require both provenance flags and retain Unicode text", () => {
  const rendered = `before ${marker(metadata)}A界é\nline${marker(null)} after`;
  const spans = parseTerminalText({
    message: rendered,
    personal: true,
    terminalInteractions: true,
  });
  assert.deepEqual(
    spans.map(({ text, interaction }) => ({ text, interaction })),
    [
      { text: "before ", interaction: undefined },
      { text: "A界é\nline", interaction: metadata },
      { text: " after", interaction: undefined },
    ],
  );
  assert.equal(new Set(spans.map((span) => span.start)).size, 3);
  for (const [personal, terminalInteractions] of [
    [undefined, undefined],
    [true, undefined],
    [false, true],
    [true, false],
  ]) {
    const plain = parseTerminalText({
      message: rendered,
      personal,
      terminalInteractions,
    });
    assert.equal(
      plain.map((span) => span.text).join(""),
      "before A界é\nline after",
    );
    assert.ok(plain.every((span) => !span.interaction));
  }
});

test("React spans remove ANSI styling and unknown controls without losing boundaries", () => {
  const input = {
    message:
      `\u001B[31mplain\u001B[0m ${marker(metadata)}\u001B[1mstyled\u001B[0m` +
      `\u001B]777;soulfire;2;unknown\u001B\\ordinary\u001B]52;c;payload\u0007`,
    personal: true,
    terminalInteractions: true,
  };
  const spans = parseTerminalText(input);
  assert.deepEqual(
    spans.map((span) => span.text),
    ["plain ", "styled", "ordinary"],
  );
  assert.deepEqual(spans[1]?.interaction, metadata);
  assert.ok(spans[2]);
  assert.equal(spans[2].interaction, undefined);
  assert.equal(
    parseTerminalText(input, true)
      .map((span) => span.text)
      .join(""),
    "\u001B[31mplain\u001B[0m \u001B[1mstyled\u001B[0mordinary",
  );
});

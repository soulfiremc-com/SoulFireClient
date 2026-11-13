import assert from "node:assert/strict";
import { test } from "node:test";
import { PovInputEvent_Kind as Kind } from "@/generated/soulfire/pov_pb";
import { textEditEvents, textInputEvents } from "./pov-text-input";

const key = (code: number, modifiers = 0) => [
  { kind: Kind.KEY, code, action: 1, modifiers },
  { kind: Kind.KEY, code, action: 0, modifiers },
];
const character = (code: number) => ({
  kind: Kind.CHARACTER,
  code,
  action: 0,
  modifiers: 0,
});
const actions = (events: ReturnType<typeof textInputEvents>) =>
  events.map(({ kind, code, action, modifiers }) => ({
    kind,
    code,
    action,
    modifiers,
  }));

test("committed text preserves Unicode scalars and excludes invalid wire characters", () => {
  assert.deepEqual(actions(textInputEvents("A\u0000\ud800😀\udfff\u0008")), [
    character(65),
    character(0x1f600),
  ]);
});

test("line endings and tabs become ordered native keys rather than invalid characters", () => {
  assert.deepEqual(actions(textInputEvents("a\r\nb\rc\nd\te")), [
    character(97),
    ...key(257),
    character(98),
    ...key(257),
    character(99),
    ...key(257),
    character(100),
    ...key(258),
    character(101),
  ]);
});

test("deletion intents preserve direction and word boundaries", () => {
  for (const [inputType, code, modifiers] of [
    ["deleteContentBackward", 259, 0],
    ["deleteContentForward", 261, 0],
    ["deleteWordBackward", 259, 2],
    ["deleteWordForward", 261, 2],
  ] as const)
    assert.deepEqual(
      actions(textEditEvents({ inputType, isComposing: false })),
      key(code, modifiers),
    );
});

test("editing IME drafts does not delete committed native text", () => {
  assert.deepEqual(
    textEditEvents({ inputType: "deleteContentBackward", isComposing: true }),
    [],
  );
  for (const inputType of [
    "insertText",
    "insertLineBreak",
    "insertCompositionText",
    "deleteCompositionText",
  ])
    assert.deepEqual(textEditEvents({ inputType, isComposing: false }), []);
});

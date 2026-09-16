import { create } from "@bufbuild/protobuf";
import {
  PovInputEvent_Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";

const specialKeys: Record<string, number> = {
  Space: 32,
  Quote: 39,
  Comma: 44,
  Minus: 45,
  Period: 46,
  Slash: 47,
  Semicolon: 59,
  Equal: 61,
  BracketLeft: 91,
  Backslash: 92,
  BracketRight: 93,
  Backquote: 96,
  Escape: 256,
  Enter: 257,
  Tab: 258,
  Backspace: 259,
  Insert: 260,
  Delete: 261,
  ArrowRight: 262,
  ArrowLeft: 263,
  ArrowDown: 264,
  ArrowUp: 265,
  PageUp: 266,
  PageDown: 267,
  Home: 268,
  End: 269,
  CapsLock: 280,
  ScrollLock: 281,
  NumLock: 282,
  PrintScreen: 283,
  Pause: 284,
  NumpadDecimal: 330,
  NumpadDivide: 331,
  NumpadMultiply: 332,
  NumpadSubtract: 333,
  NumpadAdd: 334,
  NumpadEnter: 335,
  NumpadEqual: 336,
  ShiftLeft: 340,
  ControlLeft: 341,
  AltLeft: 342,
  ShiftRight: 344,
  ControlRight: 345,
  AltRight: 346,
  ContextMenu: 348,
};

export function glfwKey(code: string): number | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(code)) return 320 + Number(code.slice(6));
  if (/^F([1-9]|1[0-9]|2[0-5])$/.test(code)) return 289 + Number(code.slice(1));
  return specialKeys[code];
}

export function inputModifiers(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): number {
  return (
    Number(event.shiftKey) |
    (Number(event.ctrlKey) << 1) |
    (Number(event.altKey) << 2) |
    (Number(event.metaKey) << 3)
  );
}

export function mouseButton(button: number): number {
  return button === 1 ? 2 : button === 2 ? 1 : button;
}

export function isSystemShortcut(
  event: Pick<KeyboardEvent, "code" | "metaKey" | "altKey" | "ctrlKey">,
): boolean {
  return (
    event.metaKey ||
    event.code === "MetaLeft" ||
    event.code === "MetaRight" ||
    (event.altKey &&
      (event.code === "Tab" ||
        event.code === "F4" ||
        event.code === "Escape")) ||
    (event.ctrlKey && event.code === "Escape")
  );
}

export function keyInput(event: KeyboardEvent, pressed: boolean) {
  if (isSystemShortcut(event)) return null;
  const code = glfwKey(event.code);
  return code === undefined
    ? null
    : create(PovInputEventSchema, {
        kind: PovInputEvent_Kind.KEY,
        code,
        action: pressed ? (event.repeat ? 2 : 1) : 0,
        modifiers: inputModifiers(event),
      });
}

export function isPovReleaseShortcut(
  event: Pick<
    KeyboardEvent,
    "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
  >,
  mac: boolean,
): boolean {
  return (
    event.code === "KeyG" &&
    event.shiftKey &&
    !event.altKey &&
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}

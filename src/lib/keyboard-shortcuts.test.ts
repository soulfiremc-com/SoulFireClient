import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPrimaryKeyShortcut,
  projectShortcutIndex,
  shortcutLetter,
} from "./keyboard-shortcuts";

const keyEvent = (key: string, code: string) => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
});

test("project shortcuts map Ctrl+1 to Ctrl+9 to the first nine projects", () => {
  assert.equal(
    projectShortcutIndex({ ...keyEvent("1", "Digit1"), ctrlKey: true }, false),
    0,
  );
  assert.equal(
    projectShortcutIndex({ ...keyEvent("9", "Digit9"), ctrlKey: true }, false),
    8,
  );
  assert.equal(
    projectShortcutIndex({ ...keyEvent("0", "Digit0"), ctrlKey: true }, false),
    null,
  );
  assert.equal(projectShortcutIndex(keyEvent("1", "Digit1"), false), null);
});

test("project shortcuts use Command on macOS and Ctrl elsewhere", () => {
  const digit = keyEvent("2", "Digit2");
  assert.equal(projectShortcutIndex({ ...digit, metaKey: true }, true), 1);
  assert.equal(projectShortcutIndex({ ...digit, ctrlKey: true }, true), null);
  assert.equal(projectShortcutIndex({ ...digit, metaKey: true }, false), null);
});

test("project shortcuts read the physical key on layouts where digits need Shift", () => {
  // AZERTY types "&" on the 1 key without Shift.
  assert.equal(
    projectShortcutIndex({ ...keyEvent("&", "Digit1"), ctrlKey: true }, false),
    0,
  );
  assert.equal(
    projectShortcutIndex({ ...keyEvent("3", "Numpad3"), ctrlKey: true }, false),
    2,
  );
});

test("project shortcuts ignore extra modifiers, repeats, and composition", () => {
  const event = { ...keyEvent("1", "Digit1"), ctrlKey: true };
  for (const flag of ["altKey", "shiftKey", "repeat", "isComposing"] as const)
    assert.equal(projectShortcutIndex({ ...event, [flag]: true }, false), null);
});

test("letter shortcuts fall back to the physical key only on non-Latin layouts", () => {
  const event = { ...keyEvent("b", "KeyB"), ctrlKey: true };
  assert.equal(isPrimaryKeyShortcut(event, "b", false), true);
  assert.equal(isPrimaryKeyShortcut({ ...event, key: "и" }, "b", false), true);
  assert.equal(isPrimaryKeyShortcut({ ...event, key: "x" }, "b", false), false);
});

test("shortcut letters follow the layout and fall back to the physical key", () => {
  // AZERTY: the key labelled A sits where QWERTY has Q.
  assert.equal(shortcutLetter({ key: "a", code: "KeyQ" }), "a");
  assert.equal(shortcutLetter({ key: "H", code: "KeyH" }), "h");
  // macOS Option types other characters or starts a dead key.
  assert.equal(shortcutLetter({ key: "å", code: "KeyA" }), "a");
  assert.equal(shortcutLetter({ key: "Dead", code: "KeyE" }), "e");
  assert.equal(shortcutLetter({ key: "л", code: "KeyK" }), "k");
  assert.equal(shortcutLetter({ key: "[", code: "BracketLeft" }), null);
});

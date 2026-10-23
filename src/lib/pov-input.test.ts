import assert from "node:assert/strict";
import { test } from "node:test";
import {
  glfwKey,
  inputModifiers,
  keyInput,
  isPovReleaseShortcut,
  isSystemShortcut,
  isTextEditingShortcut,
  isTextInputKey,
  mouseButton,
  textShortcutKey,
} from "./pov-input";

test("physical keyboard codes map independently of typed text and include extended keys", () => {
  assert.equal(glfwKey("KeyW"), 87);
  assert.equal(glfwKey("Digit9"), 57);
  assert.equal(glfwKey("Numpad9"), 329);
  assert.equal(glfwKey("F12"), 301);
  assert.equal(glfwKey("ControlRight"), 345);
  assert.equal(glfwKey("Unknown"), undefined);
});

test("browser middle/right buttons and simultaneous modifiers map to GLFW", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(mouseButton), [0, 2, 1, 3, 4]);
  assert.equal(
    inputModifiers({
      shiftKey: true,
      ctrlKey: true,
      altKey: false,
      metaKey: true,
    }),
    11,
  );
});

test("OS shortcuts remain available while Minecraft keys and Escape are forwarded", () => {
  const event = { code: "KeyW", metaKey: false, altKey: false, ctrlKey: false };
  assert.equal(isSystemShortcut(event), false);
  assert.equal(isSystemShortcut({ ...event, code: "Escape" }), false);
  assert.equal(glfwKey("Escape"), 256);
  assert.equal(glfwKey("MetaLeft"), undefined);
  assert.equal(isSystemShortcut({ ...event, code: "MetaLeft" }), true);
  assert.equal(isSystemShortcut({ ...event, metaKey: true }), true);
  assert.equal(isSystemShortcut({ ...event, code: "Tab", altKey: true }), true);
  assert.equal(isSystemShortcut({ ...event, code: "F4", altKey: true }), true);
  assert.equal(
    isSystemShortcut({ ...event, code: "KeyQ", ctrlKey: true }),
    false,
  );
});

test("release chord follows the keyboard layout and platform modifiers", () => {
  const event = {
    code: "KeyG",
    key: "G",
    shiftKey: true,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
  };
  assert.equal(isPovReleaseShortcut(event, false), true);
  assert.equal(isPovReleaseShortcut(event, true), false);
  assert.equal(
    isPovReleaseShortcut({ ...event, ctrlKey: false, metaKey: true }, true),
    true,
  );
  assert.equal(
    isPovReleaseShortcut({ ...event, ctrlKey: false, metaKey: true }, false),
    false,
  );
  assert.equal(
    isPovReleaseShortcut({ ...event, shiftKey: false }, false),
    false,
  );
  assert.equal(isPovReleaseShortcut({ ...event, altKey: true }, false), false);
  assert.equal(
    isPovReleaseShortcut({ ...event, code: "Escape", key: "Escape" }, false),
    false,
  );
  for (const mac of [false, true]) {
    const modifiers = { ...event, ctrlKey: !mac, metaKey: mac };
    assert.equal(
      isPovReleaseShortcut({ ...modifiers, code: "KeyI" }, mac),
      true,
    );
    assert.equal(isPovReleaseShortcut({ ...modifiers, key: "I" }, mac), false);
    assert.equal(isPovReleaseShortcut({ ...modifiers, key: "П" }, mac), true);
  }
});

test("Command editing shortcuts reach native text fields as Control shortcuts", () => {
  for (const code of ["KeyA", "KeyC", "KeyX"]) {
    const event = {
      code,
      key: code.slice(-1).toLowerCase(),
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
    };
    const pressed = keyInput(event, true, true);
    const released = keyInput(event, false, true);
    assert.equal(pressed?.code, glfwKey(code));
    assert.equal(pressed?.modifiers, 2);
    assert.equal(pressed?.action, 1);
    assert.equal(released?.modifiers, 2);
    assert.equal(released?.action, 0);
    assert.equal(keyInput(event, true, false), null);
  }
});

test("native text editing leaves system shortcuts and browser paste available", () => {
  const event = {
    code: "KeyR",
    key: "r",
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  };
  for (const code of ["KeyR", "KeyQ", "KeyT", "KeyV", "Tab"])
    assert.equal(keyInput({ ...event, code }, true, true), null);
  assert.equal(
    keyInput({ ...event, code: "KeyC", shiftKey: true }, true, true),
    null,
  );
  assert.equal(
    keyInput({ ...event, code: "KeyC", altKey: true }, true, true),
    null,
  );
});

test("Control editing shortcuts preserve modified game key combinations", () => {
  const event = {
    code: "KeyC",
    key: "c",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  };
  assert.equal(isTextEditingShortcut(event), true);
  assert.equal(keyInput(event, true, true)?.modifiers, 2);
  const shifted = { ...event, shiftKey: true };
  assert.equal(isTextEditingShortcut(shifted), false);
  assert.equal(keyInput(shifted, true, true)?.modifiers, 3);
  assert.equal(keyInput({ ...event, repeat: true }, true, true)?.action, 2);
});

test("layout shortcuts retain physical identity and follow the logical letter", () => {
  const event = {
    code: "KeyQ",
    key: "a",
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  };
  assert.equal(isTextEditingShortcut(event), true);
  const press = keyInput(event, true, true);
  assert.equal(press?.code, 81);
  assert.equal(press?.key, "a");
  assert.equal(press?.modifiers, 2);
  const release = keyInput(
    { ...event, key: "A", metaKey: false, shiftKey: true },
    false,
    true,
  );
  assert.equal(release?.code, press?.code);
  assert.equal(release?.action, 0);
  assert.equal(
    isTextEditingShortcut({ ...event, code: "KeyA", key: "q" }),
    false,
  );
  assert.equal(
    isTextEditingShortcut({ ...event, code: "KeyA", key: "ф" }),
    true,
  );
  assert.equal(textShortcutKey({ code: "KeyK", key: "v" }), "v");
  assert.equal(textShortcutKey({ code: "KeyV", key: "м" }), "v");
});

test("composition filters key presses without losing physical key releases", () => {
  const event = {
    code: "KeyW",
    key: "w",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: true,
  };
  assert.equal(keyInput(event, true, false), null);
  const release = keyInput(event, false, false);
  assert.equal(release?.code, 87);
  assert.equal(release?.action, 0);
});

test("browser text input accepts dead keys and AltGr characters without consuming shortcuts", () => {
  const event = { key: "a", ctrlKey: false, altKey: false, metaKey: false };
  for (const key of ["a", "é", "😀", "Dead"])
    assert.equal(isTextInputKey({ ...event, key }), true);
  assert.equal(
    isTextInputKey({ ...event, key: "@", ctrlKey: true, altKey: true }),
    true,
  );
  assert.equal(isTextInputKey({ ...event, key: "Dead", altKey: true }), true);
  for (const key of [
    "Enter",
    "Tab",
    "ArrowLeft",
    "Backspace",
    "",
    "Unidentified",
  ])
    assert.equal(isTextInputKey({ ...event, key }), false);
  assert.equal(isTextInputKey({ ...event, ctrlKey: true }), false);
  assert.equal(isTextInputKey({ ...event, metaKey: true }), false);
  assert.equal(isTextInputKey({ ...event, key: "Dead", ctrlKey: true }), false);
  assert.equal(
    isTextInputKey({ ...event, ctrlKey: true, altKey: true, metaKey: true }),
    false,
  );
});

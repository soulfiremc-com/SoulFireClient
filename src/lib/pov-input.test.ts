import assert from "node:assert/strict";
import { test } from "node:test";
import {
  glfwKey,
  inputModifiers,
  isSystemShortcut,
  mouseButton,
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

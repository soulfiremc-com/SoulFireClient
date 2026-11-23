import { describe, expect, test } from "bun:test";
import { canvasShortcutKeys, matchCanvasShortcut } from "./canvas-shortcuts";

function press(
  key: string,
  options: Partial<{
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    repeat: boolean;
  }> = {},
) {
  return matchCanvasShortcut({
    key,
    code: options.code ?? "",
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    repeat: options.repeat ?? false,
  });
}

describe("matchCanvasShortcut", () => {
  test("reads letters with Caps Lock on", () => {
    expect(press("A", { code: "KeyA" })?.id).toBe("selectAll");
    expect(press("X", { code: "KeyX" })?.id).toBe("delete");
  });

  test("reads the physical key on non-Latin layouts", () => {
    expect(press("ф", { code: "KeyA" })?.id).toBe("selectAll");
    expect(press("Ф", { code: "KeyA", shiftKey: true })?.id).toBe("quickAdd");
  });

  test("requires the exact modifiers", () => {
    expect(press("h", { code: "KeyH" })?.id).toBe("collapse");
    expect(press("H", { code: "KeyH", shiftKey: true })?.id).toBe("preview");
    expect(press("h", { code: "KeyH", ctrlKey: true })?.id).toBe("hideSockets");
    expect(press("H", { code: "KeyH", altKey: true, shiftKey: true })?.id).toBe(
      "distribute",
    );
    expect(press("x", { code: "KeyX", ctrlKey: true })).toBeNull();
    expect(press("j", { code: "KeyJ", ctrlKey: true, shiftKey: true })).toBe(
      null,
    );
  });

  test("treats Command like Ctrl", () => {
    expect(press("z", { code: "KeyZ", metaKey: true })?.id).toBe("undo");
    expect(
      press("z", { code: "KeyZ", metaKey: true, shiftKey: true })?.id,
    ).toBe("redo");
  });

  test("reads Option letters on macOS from the physical key", () => {
    expect(press("å", { code: "KeyA", altKey: true })?.id).toBe("deselectAll");
  });

  test("ignores held keys for actions that add or remove", () => {
    expect(press("D", { code: "KeyD", shiftKey: true, repeat: true })).toEqual({
      id: "duplicate",
      key: "d",
      ignoredRepeat: true,
    });
    expect(
      press("z", { code: "KeyZ", ctrlKey: true, repeat: true })?.ignoredRepeat,
    ).toBe(false);
  });

  test("leaves copy and paste to the clipboard events", () => {
    expect(press("c", { code: "KeyC", ctrlKey: true })).toBeNull();
    expect(press("v", { code: "KeyV", ctrlKey: true })).toBeNull();
  });

  test("reports which arrow aligns the nodes", () => {
    expect(press("ArrowLeft", { ctrlKey: true, shiftKey: true })).toMatchObject(
      { id: "align", key: "ArrowLeft" },
    );
    expect(press("ArrowLeft", { shiftKey: true })).toBeNull();
  });
});

const plain = (text: string) => text;

describe("canvasShortcutKeys", () => {
  test("lists every binding", () => {
    expect(canvasShortcutKeys("redo", plain)).toBe(
      "Ctrl + Shift + Z / Ctrl + Y",
    );
    expect(canvasShortcutKeys("delete", plain)).toBe("Delete / Backspace / X");
  });

  test("shows only the main binding for menus", () => {
    expect(canvasShortcutKeys("delete", plain, true)).toBe("Delete");
    expect(canvasShortcutKeys("ungroup", plain, true)).toBe("Ctrl + Alt + G");
  });
});

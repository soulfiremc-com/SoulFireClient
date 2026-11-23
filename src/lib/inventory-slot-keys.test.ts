import { describe, expect, test } from "bun:test";
import {
  slotContextMenuClick,
  slotKeyAction,
  slotPrimaryClick,
} from "@/lib/inventory-slot-keys.ts";

function key(
  value: string,
  modifiers: Partial<{
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  }> = {},
) {
  return {
    key: value,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
  };
}

describe("slotKeyAction", () => {
  test("leaves plain Enter and Space to the native click", () => {
    expect(slotKeyAction(key("Enter"))).toBeUndefined();
    expect(slotKeyAction(key(" "))).toBeUndefined();
  });

  test("leaves the context menu keys to the native contextmenu event", () => {
    expect(slotKeyAction(key("ContextMenu"))).toBeUndefined();
    expect(slotKeyAction(key("F10", { shiftKey: true }))).toBeUndefined();
  });

  test("maps Shift+Enter to a quick move and Alt+Enter to a middle click", () => {
    expect(slotKeyAction(key("Enter", { shiftKey: true }))).toBe("shift");
    expect(slotKeyAction(key("Enter", { altKey: true }))).toBe("middle");
  });

  test("ignores shortcuts that use Ctrl or Meta", () => {
    expect(slotKeyAction(key("Enter", { ctrlKey: true }))).toBeUndefined();
    expect(
      slotKeyAction(key("Enter", { shiftKey: true, metaKey: true })),
    ).toBeUndefined();
  });
});

describe("slotPrimaryClick", () => {
  test("uses the chosen click mode for a plain click or tap", () => {
    expect(slotPrimaryClick({ shiftKey: false }, "left")).toBe("left");
    expect(slotPrimaryClick({ shiftKey: false }, "right")).toBe("right");
    expect(slotPrimaryClick({ shiftKey: false }, "middle")).toBe("middle");
  });

  test("quick moves on Shift+click in any mode", () => {
    expect(slotPrimaryClick({ shiftKey: true }, "left")).toBe("shift");
    expect(slotPrimaryClick({ shiftKey: true }, "right")).toBe("shift");
  });
});

describe("slotContextMenuClick", () => {
  test("right-clicks for the right button, a long press, or the Menu key", () => {
    expect(slotContextMenuClick({ shiftKey: false, button: 2 })).toBe("right");
    expect(slotContextMenuClick({ shiftKey: false, button: 0 })).toBe("right");
  });

  test("quick moves only for a real Shift+right-click", () => {
    expect(slotContextMenuClick({ shiftKey: true, button: 2 })).toBe("shift");
  });

  test("right-clicks for Shift+F10, which reports no right button", () => {
    expect(slotContextMenuClick({ shiftKey: true, button: 0 })).toBe("right");
  });
});

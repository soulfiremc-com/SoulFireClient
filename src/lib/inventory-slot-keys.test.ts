import { describe, expect, test } from "bun:test";
import { slotKeyAction } from "@/lib/inventory-slot-keys.ts";

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

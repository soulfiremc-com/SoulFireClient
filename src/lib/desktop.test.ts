import { describe, expect, test } from "bun:test";
import { formatShortcutForPlatform } from "@/lib/desktop";

describe("formatShortcutForPlatform", () => {
  test("keeps shortcuts unchanged outside macOS", () => {
    expect(formatShortcutForPlatform("Ctrl+K", false)).toBe("Ctrl+K");
    expect(formatShortcutForPlatform("Ctrl + Shift + Z", false)).toBe(
      "Ctrl + Shift + Z",
    );
  });

  test("joins macOS modifier symbols without separators", () => {
    expect(formatShortcutForPlatform("Ctrl+K", true)).toBe("⌘K");
    expect(formatShortcutForPlatform("Ctrl+1", true)).toBe("⌘1");
    expect(formatShortcutForPlatform("Shift + A", true)).toBe("⇧A");
  });

  test("orders macOS modifiers as Option, Shift, Command", () => {
    expect(formatShortcutForPlatform("Ctrl + Shift + Z", true)).toBe("⇧⌘Z");
    expect(formatShortcutForPlatform("Ctrl + Alt + G", true)).toBe("⌥⌘G");
    expect(formatShortcutForPlatform("Alt + Shift + H/V", true)).toBe("⌥⇧H/V");
  });

  test("leaves keys that are not shortcuts readable", () => {
    expect(formatShortcutForPlatform("Delete / Backspace / X", true)).toBe(
      "Delete / Backspace / X",
    );
    expect(formatShortcutForPlatform("Alt", true)).toBe("⌥");
  });
});

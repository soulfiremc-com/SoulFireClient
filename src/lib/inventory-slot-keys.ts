export type SlotKeyAction = "shift" | "middle";

/// Maps keyboard shortcuts on an inventory slot to the mouse click they stand for.
/// Plain Enter and Space stay with the native button click. The Menu key and
/// Shift+F10 stay with the native contextmenu event, which some platforms
/// fire on keyup even when keydown was handled.
export function slotKeyAction(event: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): SlotKeyAction | undefined {
  if (event.ctrlKey || event.metaKey || event.key !== "Enter") return undefined;
  if (event.altKey) return "middle";
  if (event.shiftKey) return "shift";
  return undefined;
}

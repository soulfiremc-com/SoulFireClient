/** What a slot interaction means, in the terms of a Minecraft mouse click. */
export type SlotClickKind = "left" | "right" | "shift" | "middle";

export type SlotKeyAction = Extract<SlotClickKind, "shift" | "middle">;

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

/// Maps a primary click (mouse, tap, Enter, or Space) to a click kind.
/// Shift always quick moves, as in Minecraft. Otherwise the chosen click mode
/// applies, so touch users can right-click or quick move with a tap.
export function slotPrimaryClick(
  event: { shiftKey: boolean },
  mode: SlotClickKind,
): SlotClickKind {
  return event.shiftKey ? "shift" : mode;
}

/// Maps a contextmenu event to a click kind. Shift+F10 opens the context menu
/// from the keyboard with shiftKey set but no right button, so only a real
/// Shift+right-click quick moves.
export function slotContextMenuClick(event: {
  shiftKey: boolean;
  button: number;
}): SlotClickKind {
  return event.shiftKey && event.button === 2 ? "shift" : "right";
}

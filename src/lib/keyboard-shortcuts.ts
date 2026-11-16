import { textShortcutKey } from "@/lib/pov-input";

export type ShortcutEvent = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
  | "repeat"
  | "isComposing"
>;

/**
 * The platform's primary modifier on its own: Command on macOS, Ctrl elsewhere.
 * macOS text fields use Ctrl+K, Ctrl+P, and Ctrl+B to edit text.
 */
export function isPrimaryShortcut(event: ShortcutEvent, mac: boolean): boolean {
  return (
    !event.repeat &&
    !event.isComposing &&
    !event.altKey &&
    !event.shiftKey &&
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}

/**
 * The primary modifier with one letter. Falls back to the physical key on
 * non-Latin layouts, so Ctrl+K still works with a Cyrillic layout.
 */
export function isPrimaryKeyShortcut(
  event: ShortcutEvent,
  key: string,
  mac: boolean,
): boolean {
  return isPrimaryShortcut(event, mac) && textShortcutKey(event) === key;
}

export const PROJECT_SHORTCUT_LIMIT = 9;

/**
 * The zero-based project for Ctrl+1 to Ctrl+9, or Command+1 to Command+9 on
 * macOS. Reads the physical key so layouts like AZERTY, where the top row
 * types symbols, still switch projects.
 */
export function projectShortcutIndex(
  event: ShortcutEvent,
  mac: boolean,
): number | null {
  if (!isPrimaryShortcut(event, mac)) return null;
  const digit = /^[1-9]$/.test(event.key)
    ? event.key
    : /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1];
  return digit ? Number(digit) - 1 : null;
}

/** True while a dialog, or a popover with the dialog role, is open. */
export function hasOpenDialog(root: Pick<Document, "querySelector">): boolean {
  return Boolean(
    root.querySelector(
      '[role="dialog"]:not([data-closed]), [role="alertdialog"]:not([data-closed])',
    ),
  );
}

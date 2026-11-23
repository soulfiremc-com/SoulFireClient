import { shortcutLetter } from "@/lib/keyboard-shortcuts";

/** One key with an exact set of modifiers. Ctrl and Command both count as primary. */
export interface KeyBinding {
  /** A lowercase letter, or a `KeyboardEvent.key` name such as "Delete". */
  key: string;
  primary?: true;
  alt?: true;
  shift?: true;
}

export type CanvasShortcutId =
  | "quickAdd"
  | "quickAddAtCursor"
  | "selectAll"
  | "deselectAll"
  | "selectLinked"
  | "selectUpstream"
  | "selectDownstream"
  | "selectSimilar"
  | "duplicate"
  | "copy"
  | "paste"
  | "undo"
  | "redo"
  | "delete"
  | "rename"
  | "mute"
  | "collapse"
  | "hideSockets"
  | "preview"
  | "group"
  | "ungroup"
  | "enterGroup"
  | "frame"
  | "align"
  | "distribute"
  | "cutLinks"
  | "reroute";

export interface CanvasShortcut {
  id: CanvasShortcutId;
  bindings: readonly KeyBinding[];
  /** A pointer gesture that goes with the keys. The canvas handles it. */
  mouse?: "drag" | "rightClick";
  /** The browser's copy and paste events handle it, not keydown. */
  native?: true;
  /** Runs again while the key is held. Off for actions that add or remove. */
  repeat?: true;
  /** Shorter text for the help when the bindings would be too long. */
  label?: string;
}

/** The canvas shortcuts, in the order that the help lists them. */
export const CANVAS_SHORTCUTS: readonly CanvasShortcut[] = [
  { id: "quickAdd", bindings: [{ key: "a", shift: true }] },
  { id: "quickAddAtCursor", bindings: [], mouse: "rightClick" },
  { id: "selectAll", bindings: [{ key: "a" }] },
  { id: "deselectAll", bindings: [{ key: "a", alt: true }] },
  { id: "selectLinked", bindings: [{ key: "l" }] },
  { id: "selectUpstream", bindings: [{ key: "l", primary: true }] },
  { id: "selectDownstream", bindings: [{ key: "l", alt: true }] },
  { id: "selectSimilar", bindings: [{ key: "s", shift: true }] },
  { id: "duplicate", bindings: [{ key: "d", shift: true }] },
  { id: "copy", bindings: [{ key: "c", primary: true }], native: true },
  { id: "paste", bindings: [{ key: "v", primary: true }], native: true },
  { id: "undo", bindings: [{ key: "z", primary: true }], repeat: true },
  {
    id: "redo",
    bindings: [
      { key: "z", primary: true, shift: true },
      { key: "y", primary: true },
    ],
    repeat: true,
  },
  {
    id: "delete",
    bindings: [{ key: "Delete" }, { key: "Backspace" }, { key: "x" }],
  },
  { id: "rename", bindings: [{ key: "F2" }] },
  { id: "mute", bindings: [{ key: "m" }] },
  { id: "collapse", bindings: [{ key: "h" }] },
  { id: "hideSockets", bindings: [{ key: "h", primary: true }] },
  { id: "preview", bindings: [{ key: "h", shift: true }] },
  { id: "group", bindings: [{ key: "g", primary: true }] },
  { id: "ungroup", bindings: [{ key: "g", primary: true, alt: true }] },
  { id: "enterGroup", bindings: [{ key: "Tab" }] },
  { id: "frame", bindings: [{ key: "j", primary: true }] },
  {
    id: "align",
    bindings: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map(
      (key) => ({ key, primary: true, shift: true }) as const,
    ),
    repeat: true,
    label: "Ctrl + Shift + ←↑↓→",
  },
  {
    id: "distribute",
    bindings: [
      { key: "h", alt: true, shift: true },
      { key: "v", alt: true, shift: true },
    ],
    label: "Alt + Shift + H/V",
  },
  { id: "cutLinks", bindings: [{ key: "Alt" }], mouse: "drag" },
  { id: "reroute", bindings: [{ key: "Shift" }], mouse: "rightClick" },
];

export interface CanvasShortcutMatch {
  id: CanvasShortcutId;
  /** The matched key: a lowercase letter or a key name. */
  key: string;
  /** A held key repeated an action that should run once. */
  ignoredRepeat: boolean;
}

type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat"
>;

/**
 * Finds the canvas shortcut for a key press. Modifiers must match exactly.
 * Letters match by the typed letter, or by the physical key on non-Latin
 * layouts and with Option on macOS, so Caps Lock and layout do not matter.
 */
export function matchCanvasShortcut(
  event: ShortcutEvent,
): CanvasShortcutMatch | null {
  const letter = shortcutLetter(event);
  const primary = event.ctrlKey || event.metaKey;
  for (const shortcut of CANVAS_SHORTCUTS) {
    if (shortcut.mouse || shortcut.native) continue;
    for (const binding of shortcut.bindings) {
      if (
        Boolean(binding.primary) !== primary ||
        Boolean(binding.alt) !== event.altKey ||
        Boolean(binding.shift) !== event.shiftKey
      ) {
        continue;
      }
      const matches =
        binding.key.length === 1
          ? letter === binding.key
          : event.key === binding.key;
      if (matches) {
        return {
          id: shortcut.id,
          key: binding.key,
          ignoredRepeat: event.repeat && !shortcut.repeat,
        };
      }
    }
  }
  return null;
}

function bindingText(binding: KeyBinding): string {
  return [
    binding.primary && "Ctrl",
    binding.alt && "Alt",
    binding.shift && "Shift",
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
  ]
    .filter(Boolean)
    .join(" + ");
}

/**
 * The keys of a shortcut, such as "Ctrl + Shift + Z / Ctrl + Y". Pass the
 * platform formatter to show macOS symbols. Menus pass `firstOnly` to show
 * only the main binding.
 */
export function canvasShortcutKeys(
  id: CanvasShortcutId,
  format: (shortcut: string) => string,
  firstOnly = false,
): string {
  const shortcut = CANVAS_SHORTCUTS.find((entry) => entry.id === id);
  if (!shortcut) return "";
  if (shortcut.label) return format(shortcut.label);
  const bindings = firstOnly
    ? shortcut.bindings.slice(0, 1)
    : shortcut.bindings;
  return bindings.map((binding) => format(bindingText(binding))).join(" / ");
}

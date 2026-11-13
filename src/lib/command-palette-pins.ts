import type { PaletteCommand } from "@/lib/command-palette";

/** A pin stores only a stable command ID and its project, never a payload. */
export type PalettePin = { id: string; projectId?: string };

export const PIN_LIMIT = 12;
const MAX_ID_LENGTH = 512;

export function palettePinKey(
  server: string | null | undefined,
  user: string,
): string {
  return `sf-palette-pins:${JSON.stringify([server ?? null, user])}`;
}

function isPin(value: unknown): value is PalettePin {
  if (typeof value !== "object" || value === null) return false;
  const { id, projectId } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= MAX_ID_LENGTH &&
    (projectId === undefined ||
      (typeof projectId === "string" &&
        projectId.length > 0 &&
        projectId.length <= MAX_ID_LENGTH))
  );
}

export function readPalettePins(
  storage: Pick<Storage, "getItem">,
  key: string,
): PalettePin[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .filter(isPin)
      .filter((pin) => !seen.has(pin.id) && Boolean(seen.add(pin.id)))
      .slice(0, PIN_LIMIT)
      .map(({ id, projectId }) => (projectId ? { id, projectId } : { id }));
  } catch {
    return [];
  }
}

export function isPalettePinned(pins: readonly PalettePin[], id: string) {
  return pins.some((pin) => pin.id === id);
}

/** Returns null when the list is full and the command is not pinned yet. */
export function togglePalettePin(
  pins: readonly PalettePin[],
  command: Pick<PaletteCommand, "id" | "projectId">,
): PalettePin[] | null {
  if (isPalettePinned(pins, command.id))
    return pins.filter((pin) => pin.id !== command.id);
  if (pins.length >= PIN_LIMIT || command.id.length > MAX_ID_LENGTH)
    return null;
  return [
    ...pins,
    command.projectId
      ? { id: command.id, projectId: command.projectId }
      : { id: command.id },
  ];
}

/**
 * Resolve pins against the live catalog, which already applies permissions.
 * A pin resolves only to a command for the same project.
 */
export function resolvePalettePins(
  commands: readonly PaletteCommand[],
  pins: readonly PalettePin[],
): PaletteCommand[] {
  const byId = new Map(commands.map((command) => [command.id, command]));
  return pins.flatMap((pin) => {
    const command = byId.get(pin.id);
    return command && command.projectId === pin.projectId ? [command] : [];
  });
}

/** Drop pins for projects that are no longer in the accessible project list. */
export function prunePalettePins(
  pins: readonly PalettePin[],
  projectIds: ReadonlySet<string>,
): PalettePin[] {
  return pins.filter((pin) => !pin.projectId || projectIds.has(pin.projectId));
}

export const COMMAND_HISTORY_KEY = "sf-command-history";
const HISTORY_LIMIT = 100;

export function readCommandHistory(
  storage?: Pick<Storage, "getItem">,
): string[] {
  try {
    const value: unknown = JSON.parse(
      (storage ?? localStorage).getItem(COMMAND_HISTORY_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0,
          )
          .slice(-HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function appendCommandHistory(
  history: string[],
  command: string,
): string[] {
  return history.at(-1) === command
    ? history
    : [...history.slice(-(HISTORY_LIMIT - 1)), command];
}

export function saveCommandHistory(
  history: string[],
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? localStorage).setItem(
      COMMAND_HISTORY_KEY,
      JSON.stringify(history),
    );
  } catch {
    // History remains available in memory when browser storage is unavailable.
  }
}

export type CommandHistoryPosition = { index: number; draft: string };

export function navigateCommandHistory(
  history: string[],
  position: CommandHistoryPosition,
  value: string,
  direction: -1 | 1,
): { position: CommandHistoryPosition; value: string } | undefined {
  if (history.length === 0 || (direction > 0 && position.index === -1))
    return undefined;
  const draft = position.index === -1 ? value : position.draft;
  if (direction < 0 && position.index === 0) return undefined;
  const index =
    position.index === -1 ? history.length - 1 : position.index + direction;
  const entry = history[index];
  return entry === undefined
    ? { position: { index: -1, draft: "" }, value: draft }
    : { position: { index, draft }, value: entry };
}

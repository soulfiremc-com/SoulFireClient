// Every history key starts with this name. Without a signed-in session, such
// as in demo mode, the history uses this name alone.
export const COMMAND_HISTORY_KEY = "sf-command-history";
const HISTORY_LIMIT = 100;

// These names match the session keys that web-rpc.ts stores.
const SERVER_ADDRESS_KEY = "server-address";
const SESSION_TOKEN_KEYS = ["server-impersonation-token", "server-token"];

function tokenSubject(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const value: unknown = JSON.parse(
      atob(payload.replaceAll("-", "+").replaceAll("_", "/")),
    );
    return typeof value === "object" &&
      value !== null &&
      "sub" in value &&
      typeof value.sub === "string" &&
      value.sub !== ""
      ? value.sub
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the storage key for the command history of the signed-in user on
 * the current server. The server signs session tokens with the user ID as the
 * subject, so an impersonated user gets the history of that user.
 */
export function commandHistoryKey(
  storage: Pick<Storage, "getItem"> = localStorage,
): string {
  try {
    const address = storage.getItem(SERVER_ADDRESS_KEY);
    const token = SESSION_TOKEN_KEYS.map((key) => storage.getItem(key)).find(
      (value) => value !== null,
    );
    const user = token ? tokenSubject(token) : undefined;
    return address && user
      ? `${COMMAND_HISTORY_KEY}:${user}@${address}`
      : COMMAND_HISTORY_KEY;
  } catch {
    return COMMAND_HISTORY_KEY;
  }
}

/** Removes the command history of every user and server. */
export function clearCommandHistory(
  storage: Pick<Storage, "length" | "key" | "removeItem"> = localStorage,
): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter(
      (key): key is string =>
        key === COMMAND_HISTORY_KEY ||
        key?.startsWith(`${COMMAND_HISTORY_KEY}:`) === true,
    );
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Nothing is stored when browser storage is unavailable.
  }
}

export function readCommandHistory(
  key: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
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
  key: string,
  history: string[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(key, JSON.stringify(history));
  } catch {
    // History remains available in memory when browser storage is unavailable.
  }
}

export interface CommandHistoryPosition {
  index: number;
  draft: string;
}

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

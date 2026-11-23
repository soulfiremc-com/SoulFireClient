const SIDEBAR_STATE_KEY = "sidebar:state";

/** The saved desktop sidebar state, or null when the user never chose one. */
export function readSidebarOpen(
  storage: Pick<Storage, "getItem">,
): boolean | null {
  try {
    const value = storage.getItem(SIDEBAR_STATE_KEY);
    return value === null ? null : value === "true";
  } catch {
    return null;
  }
}

export function writeSidebarOpen(
  storage: Pick<Storage, "setItem">,
  open: boolean,
): void {
  try {
    storage.setItem(SIDEBAR_STATE_KEY, String(open));
  } catch {
    // The sidebar still works for this session without storage.
  }
}

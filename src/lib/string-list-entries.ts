export interface StringListEntry {
  id: string;
  value: string;
}

export function createStringListEntry(value: string): StringListEntry {
  return { id: crypto.randomUUID(), value };
}

export function reconcileStringListEntries(
  previous: StringListEntry[],
  values: string[],
): StringListEntry[] {
  if (
    previous.length === values.length &&
    previous.every((entry, index) => entry.value === values[index])
  ) {
    return previous;
  }

  const unchanged = values.map((value, index) =>
    previous[index]?.value === value ? previous[index] : undefined,
  );
  const reserved = new Set(
    unchanged.flatMap((entry) => (entry ? [entry.id] : [])),
  );
  const available = new Map<
    string,
    { entries: StringListEntry[]; next: number }
  >();
  for (const entry of previous) {
    if (reserved.has(entry.id)) continue;
    const bucket = available.get(entry.value);
    if (bucket) bucket.entries.push(entry);
    else available.set(entry.value, { entries: [entry], next: 0 });
  }
  const matches = values.map((value, index) => {
    if (unchanged[index]) return unchanged[index];
    const bucket = available.get(value);
    const entry = bucket?.entries[bucket.next++];
    if (entry) reserved.add(entry.id);
    return entry;
  });

  return values.map((value, index) => {
    const entry = matches[index] ?? previous[index];
    if (entry && (matches[index] || !reserved.has(entry.id))) {
      reserved.add(entry.id);
      return entry.value === value ? entry : { ...entry, value };
    }
    return createStringListEntry(value);
  });
}

/**
 * Tracks entries the user cleared. A cleared entry stays on screen while it
 * has focus, but saves leave it out, so blank text never reaches the server.
 */
export function markClearedEntry(
  cleared: ReadonlySet<string>,
  entry: StringListEntry,
): ReadonlySet<string> {
  const blank = entry.value.trim() === "";
  if (blank === cleared.has(entry.id)) return cleared;
  const next = new Set(cleared);
  if (blank) next.add(entry.id);
  else next.delete(entry.id);
  return next;
}

/** Keeps only cleared entries that are still in the list and still blank. */
export function keepClearedEntries(
  cleared: ReadonlySet<string>,
  entries: readonly StringListEntry[],
): ReadonlySet<string> {
  if (cleared.size === 0) return cleared;
  return new Set(
    entries
      .filter((entry) => cleared.has(entry.id) && entry.value.trim() === "")
      .map((entry) => entry.id),
  );
}

/** Returns the values a save writes, without cleared entries. */
export function getSavedStringListValues(
  entries: readonly StringListEntry[],
  cleared: ReadonlySet<string>,
): string[] {
  return entries
    .filter((entry) => !cleared.has(entry.id))
    .map((entry) => entry.value);
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

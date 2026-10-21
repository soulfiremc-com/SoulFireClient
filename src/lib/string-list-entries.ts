export type StringListEntry = { id: string; value: string };

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

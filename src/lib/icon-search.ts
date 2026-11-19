export type IconTagEntry = readonly [name: string, tags: readonly string[]];

/**
 * Finds icons by name or tag and returns at most `limit` names. Rendering the
 * full Lucide set at once blocks the page for seconds, so pickers show a
 * ranked slice and ask for a narrower query.
 */
export function searchIcons(
  entries: readonly IconTagEntry[],
  query: string,
  limit: number,
): { names: string[]; total: number } {
  const text = query.trim().toLowerCase();
  const needle = text.replaceAll(/\s+/gu, "-");
  if (!needle) {
    return {
      names: entries.slice(0, limit).map(([name]) => name),
      total: entries.length,
    };
  }

  const ranked: { name: string; rank: number }[] = [];
  for (const [name, tags] of entries) {
    const rank =
      name === needle
        ? 0
        : name.startsWith(needle)
          ? 1
          : name.includes(needle)
            ? 2
            : tags.some((tag) => tag.toLowerCase().includes(text))
              ? 3
              : -1;
    if (rank >= 0) ranked.push({ name, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return {
    names: ranked.slice(0, limit).map(({ name }) => name),
    total: ranked.length,
  };
}

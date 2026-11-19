export interface ComboOptionLike {
  id: string;
  displayName: string;
  keywords: readonly string[];
}

/**
 * Finds combo options by name, id, or keyword and returns at most `limit`.
 * Some combos, such as the protocol version, have hundreds of options.
 * Rendering all of them made the picker slow to open, so the list shows a
 * ranked slice and asks for a narrower query.
 *
 * Without a query, the option with `selectedId` stays visible even when it
 * is outside the first `limit` options.
 */
export function searchComboOptions<T extends ComboOptionLike>(
  options: readonly T[],
  query: string,
  limit: number,
  selectedId?: string,
): { options: T[]; total: number } {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    const slice = options.slice(0, limit);
    const selected =
      selectedId === undefined
        ? undefined
        : options.find((option) => option.id === selectedId);
    if (selected && !slice.includes(selected)) {
      slice.splice(limit - 1, 1);
      slice.unshift(selected);
    }
    return { options: slice, total: options.length };
  }

  const ranked: { option: T; rank: number; index: number }[] = [];
  options.forEach((option, index) => {
    const name = option.displayName.toLowerCase();
    const rank =
      name === needle || option.id.toLowerCase() === needle
        ? 0
        : name.startsWith(needle)
          ? 1
          : name.includes(needle) || option.id.toLowerCase().includes(needle)
            ? 2
            : option.keywords.some((keyword) =>
                  keyword.toLowerCase().includes(needle),
                )
              ? 3
              : -1;
    if (rank >= 0) ranked.push({ option, rank, index });
  });
  // Keep the server order inside a rank, so versions stay in sequence.
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return {
    options: ranked.slice(0, limit).map(({ option }) => option),
    total: ranked.length,
  };
}

const WHITESPACE_REGEX = /\s/;

export function getCommandTokenRange(
  text: string,
  cursor: number,
): { start: number; end: number } {
  let start = 0;
  while (start < text.length) {
    if (WHITESPACE_REGEX.test(text[start])) {
      if (start === cursor) return { start: cursor, end: cursor };
      start++;
      continue;
    }
    let end = start;
    const quote = text[start];
    if (quote === '"' || quote === "'") {
      end++;
      while (end < text.length) {
        const character = text[end++];
        if (character === "\\" && end < text.length) end++;
        else if (character === quote) break;
      }
    } else {
      while (end < text.length && !WHITESPACE_REGEX.test(text[end])) end++;
    }
    if (cursor <= end) return { start, end };
    start = end;
  }
  return { start: cursor, end: cursor };
}

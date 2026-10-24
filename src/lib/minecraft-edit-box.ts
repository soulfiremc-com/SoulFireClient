export function editBoxValue(value: string, maxLength: number): string {
  let filtered = "";
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      code < 32 ||
      code === 127 ||
      code === 167 ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      continue;
    }
    if (maxLength > 0 && filtered.length + character.length > maxLength) break;
    filtered += character;
  }
  return filtered;
}

/** Formats a value for display. Objects show as JSON instead of "[object Object]". */
export function displayText(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "symbol":
      return value.toString();
    case "function":
      return value.name;
    case "object":
    case "undefined":
      break;
  }
  if (Array.isArray(value)) {
    // Matches Array#toString, which prints null and undefined items as empty strings.
    return value
      .map((item: unknown) =>
        item === null || item === undefined ? "" : displayText(item),
      )
      .join(",");
  }
  return JSON.stringify(value) ?? "";
}

/** Typed readers for the untyped `data` record of script editor nodes and edges. */
type NodeData = Readonly<Record<string, unknown>> | null | undefined;

export function nodeDataString(
  data: NodeData,
  key: string,
): string | undefined {
  const value = data?.[key];
  return typeof value === "string" ? value : undefined;
}

export function nodeDataBoolean(
  data: NodeData,
  key: string,
): boolean | undefined {
  const value = data?.[key];
  return typeof value === "boolean" ? value : undefined;
}

export function nodeDataStrings(
  data: NodeData,
  key: string,
): string[] | undefined {
  const value = data?.[key];
  return Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
}

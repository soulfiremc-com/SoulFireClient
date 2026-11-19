const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//u;

/**
 * Adds `http://` to a server address typed without a scheme, such as
 * `localhost:38765` or `192.168.1.5:38765`. Without it, the address either
 * fails URL validation or parses with `localhost:` as its scheme.
 */
export function withDefaultServerScheme(address: string): string {
  const trimmed = address.trim();
  if (trimmed === "" || SCHEME_PATTERN.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

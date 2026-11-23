/** Why a text setting value breaks its server constraints. */
export type StringSettingError = "email" | "url" | "minLength" | "pattern";

// The address format that browsers accept for type="email".
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/u;

const patternCache = new Map<string, RegExp | null>();

/** Compiles a pattern the way browsers do, or returns null when they ignore it. */
function compilePattern(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;
  let compiled: RegExp | null = null;
  for (const flags of ["v", "u"]) {
    try {
      compiled = new RegExp(`^(?:${pattern})$`, flags);
      break;
    } catch {
      // Try the next flag set. Browsers skip a pattern that does not compile.
    }
  }
  patternCache.set(pattern, compiled);
  return compiled;
}

/**
 * Checks a text setting like the browser checks the matching input. An empty
 * value passes, because settings never mark text as required.
 */
export function getStringSettingError(
  value: string,
  constraints: {
    type: "email" | "url" | "other";
    minLength: number;
    pattern: string;
  },
): StringSettingError | undefined {
  if (value === "") return undefined;
  if (constraints.type === "email" && !EMAIL_PATTERN.test(value)) {
    return "email";
  }
  if (constraints.type === "url" && !URL.canParse(value)) return "url";
  if (value.length < constraints.minLength) return "minLength";
  const pattern = constraints.pattern
    ? compilePattern(constraints.pattern)
    : null;
  if (pattern && !pattern.test(value)) return "pattern";
  return undefined;
}

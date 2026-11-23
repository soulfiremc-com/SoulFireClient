import { createHash } from "node:crypto";

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/giu;
const CSP_META =
  /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/iu;

/**
 * Replaces 'unsafe-inline' in the page's script-src with hashes of its inline
 * scripts. The build runs this, so the hashes always match the shipped HTML.
 */
export function hashInlineScriptsInCsp(html: string): string {
  const hashes = Array.from(
    html.matchAll(INLINE_SCRIPT),
    ([, body = ""]) =>
      `'sha256-${createHash("sha256").update(body).digest("base64")}'`,
  );
  return html.replace(
    CSP_META,
    (_match, start: string, policy: string, end) => {
      const directives = policy.split(";").map((directive) => {
        const parts = directive.trim().split(/\s+/u);
        if (parts[0] !== "script-src") return directive.trim();
        return [
          ...parts.filter((part) => part !== "'unsafe-inline'"),
          ...hashes,
        ].join(" ");
      });
      return `${start}${directives.join("; ").trim()}${String(end)}`;
    },
  );
}

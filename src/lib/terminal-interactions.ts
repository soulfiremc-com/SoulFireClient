/* eslint-disable no-control-regex -- Parse terminal control strings before wterm sees them. */
export type TerminalClick = {
  action: "run_command" | "suggest_command" | "copy_to_clipboard" | "open_url";
  value: string;
};
export type TerminalInteraction = { hover?: string; click?: TerminalClick };

const PRIVATE_PREFIX = "\x1b]777;soulfire;1;";
const TERMINATOR = "\x1b\\";
const CLOSE_LINK = "\x1b]8;;\x1b\\";
const decoder = new TextDecoder("utf-8", { fatal: true });
const controlStrings =
  /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]?|(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])[\s\S]*?(?:\x07|\x1b\\|\x9c|$)|\x1b[ -/]*[0-~]?/g;

function parseMetadata(encoded: string): TerminalInteraction | null {
  if (!/^[\w-]+$/.test(encoded) || encoded.length > 16384) return null;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const data: unknown = JSON.parse(
      decoder.decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))),
    );
    if (typeof data !== "object" || !data || Array.isArray(data)) return null;
    const { hover, click } = data as Record<string, unknown>;
    const result: TerminalInteraction = {};
    if (hover !== undefined) {
      if (
        typeof hover !== "string" ||
        hover.length > 4096 ||
        /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(hover)
      )
        return null;
      if (hover) result.hover = hover;
    }
    if (click !== undefined) {
      if (typeof click !== "object" || !click || Array.isArray(click))
        return null;
      const { action, value } = click as Record<string, unknown>;
      if (
        typeof value !== "string" ||
        !value ||
        value.length > 4096 ||
        /[\x00-\x1f\x7f-\x9f]/.test(value)
      )
        return null;
      if (
        action !== "run_command" &&
        action !== "suggest_command" &&
        action !== "copy_to_clipboard" &&
        action !== "open_url"
      )
        return null;
      if (action === "open_url") {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol) || url.username || url.password)
          return null;
      }
      result.click = { action, value };
    }
    return result.hover || result.click ? result : null;
  } catch {
    return null;
  }
}

// This helper also encodes deterministic fixtures for the server/client wire contract.
export function encodeTerminalInteraction(
  metadata: TerminalInteraction | null,
): string {
  const payload =
    metadata === null
      ? "-"
      : btoa(
          String.fromCharCode(
            ...new TextEncoder().encode(JSON.stringify(metadata)),
          ),
        )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
  return PRIVATE_PREFIX + payload + TERMINATOR;
}

// All controls except SGR are removed. Only a trusted, versioned private OSC can
// introduce generated OSC 8 identities; raw OSC 8 links and OSC 52 never pass.
export function terminalLogText(
  value: string,
  colors = true,
  register?: (metadata: TerminalInteraction) => string,
): string {
  let active = false;
  let spans = 0;
  const text = value
    .replace(controlStrings, (sequence) => {
      if (colors && /^\x1b\[[\d;:]*m$/.test(sequence)) return sequence;
      if (!register || !sequence.startsWith("\x1b]777;soulfire;")) return "";
      const close = active ? CLOSE_LINK : "";
      active = false;
      if (
        !sequence.startsWith(PRIVATE_PREFIX) ||
        !sequence.endsWith(TERMINATOR)
      )
        return close;
      const metadata = parseMetadata(
        sequence.slice(PRIVATE_PREFIX.length, -TERMINATOR.length),
      );
      if (!metadata || spans++ >= 64) return close;
      active = true;
      return close + `\x1b]8;;${register(metadata)}\x1b\\`;
    })
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (control) =>
      control === "\x1b" ? control : "",
    );
  return text + (active ? CLOSE_LINK : "");
}

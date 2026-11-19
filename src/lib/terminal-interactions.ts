/* oxlint-disable no-control-regex -- Parse terminal control strings before wterm sees them. */
export type TerminalClick = {
  action: "run_command" | "suggest_command" | "copy_to_clipboard" | "open_url";
  value: string;
};
export type TerminalInteraction = {
  hover?: string | undefined;
  click?: TerminalClick | undefined;
};

const PRIVATE_PREFIX = "\u001B]777;soulfire;1;";
const TERMINATOR = "\u001B\\";
const CLOSE_LINK = "\u001B]8;;\u001B\\";
const decoder = new TextDecoder("utf-8", { fatal: true });
const controlStrings =
  /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]?|(?:\u001B[\]PX^_]|[\u0090\u0098\u009D-\u009F])[\s\S]*?(?:\u0007|\u001B\\|\u009C|$)|\u001B[ -/]*[0-~]?/gu;

function parseMetadata(encoded: string): TerminalInteraction | null {
  if (!/^[\w-]+$/u.test(encoded) || encoded.length > 16384) return null;
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const data: unknown = JSON.parse(
      decoder.decode(
        Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0),
      ),
    );
    if (typeof data !== "object" || !data || Array.isArray(data)) return null;
    const hover: unknown = Reflect.get(data, "hover");
    const click: unknown = Reflect.get(data, "click");
    const result: TerminalInteraction = {};
    if (hover !== undefined) {
      if (
        typeof hover !== "string" ||
        hover.length > 4096 ||
        /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u.test(hover)
      )
        return null;
      if (hover) result.hover = hover;
    }
    if (click !== undefined) {
      if (typeof click !== "object" || !click || Array.isArray(click))
        return null;
      const action: unknown = Reflect.get(click, "action");
      const value: unknown = Reflect.get(click, "value");
      if (
        typeof value !== "string" ||
        !value ||
        value.length > 4096 ||
        /[\u0000-\u001F\u007F-\u009F]/u.test(value)
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
        if (!/^https?:$/u.test(url.protocol) || url.username || url.password)
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
          String.fromCodePoint(
            ...new TextEncoder().encode(JSON.stringify(metadata)),
          ),
        )
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replace(/=+$/u, "");
  return PRIVATE_PREFIX + payload + TERMINATOR;
}

export type TerminalLogContent = {
  message: string;
  personal?: boolean | undefined;
  terminalInteractions?: boolean | undefined;
};

export type TerminalTextSpan = {
  // Source offset identifies a span within an immutable log message.
  start: number;
  text: string;
  interaction?: TerminalInteraction | undefined;
};

// Decode once for both React text and wterm. Stream provenance, not a control
// string, grants trust; unknown controls never reach either renderer.
export function parseTerminalText(
  entry: TerminalLogContent,
  colors = false,
): TerminalTextSpan[] {
  const trusted =
    entry.personal === true && entry.terminalInteractions === true;
  const result: TerminalTextSpan[] = [];
  let active: TerminalInteraction | undefined;
  let spans = 0;
  let offset = 0;
  const append = (text: string, start: number) => {
    if (!text) return;
    const previous = result.at(-1);
    if (previous && previous.interaction === active) previous.text += text;
    else result.push({ start, text, interaction: active });
  };
  const appendText = (text: string, start: number) => {
    append(
      text
        .replaceAll(/\r\n?/gu, "\n")
        .replaceAll(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, ""),
      start,
    );
  };
  for (const match of entry.message.matchAll(controlStrings)) {
    appendText(entry.message.slice(offset, match.index), offset);
    const sequence = match[0];
    offset = match.index + sequence.length;
    if (colors && /^\u001B\[[\d;:]*m$/u.test(sequence))
      append(sequence, match.index);
    else if (trusted && sequence.startsWith("\u001B]777;soulfire;")) {
      active = undefined;
      if (
        !sequence.startsWith(PRIVATE_PREFIX) ||
        !sequence.endsWith(TERMINATOR)
      )
        continue;
      const metadata = parseMetadata(
        sequence.slice(PRIVATE_PREFIX.length, -TERMINATOR.length),
      );
      if (metadata && spans++ < 64) active = metadata;
    }
  }
  appendText(entry.message.slice(offset), offset);
  return result;
}

// The wterm adapter supplies only generated opaque OSC 8 identities. Raw OSC 8
// links and clipboard OSC 52 requests are removed by the shared decoder.
export function terminalLogText(
  value: string,
  colors = true,
  register?: (metadata: TerminalInteraction) => string,
): string {
  return parseTerminalText(
    { message: value, personal: !!register, terminalInteractions: !!register },
    colors,
  )
    .map((span) =>
      span.interaction && register
        ? `\u001B]8;;${register(span.interaction)}\u001B\\${span.text}${CLOSE_LINK}`
        : span.text,
    )
    .join("");
}

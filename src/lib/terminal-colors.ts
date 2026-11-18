// WCAG AA minimum for normal-size text.
export const TERMINAL_TEXT_CONTRAST = 4.5;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return (
    0.2126 * linearChannel(r) +
    0.7152 * linearChannel(g) +
    0.0722 * linearChannel(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function mix(from: string, to: string, amount: number): string {
  const start = channels(from);
  const end = channels(to);
  return toHex([
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  ]);
}

/**
 * Returns `color` unchanged when it is readable on `background`. Otherwise it
 * moves `color` toward `foreground` by the smallest step that reaches the
 * target ratio, so the result keeps as much of the original hue as possible.
 */
export function readableTerminalColor(
  color: string,
  background: string,
  foreground: string,
  target = TERMINAL_TEXT_CONTRAST,
): string {
  if (contrastRatio(color, background) >= target) return color;

  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step++) {
    const amount = (low + high) / 2;
    if (contrastRatio(mix(color, foreground, amount), background) >= target) {
      high = amount;
    } else {
      low = amount;
    }
  }
  // Rounding to whole channels can land just under the target.
  let result = mix(color, foreground, high);
  while (high < 1 && contrastRatio(result, background) < target) {
    high = Math.min(1, high + 1 / 255);
    result = mix(color, foreground, high);
  }
  return result;
}

import type { TerminalCore } from "@wterm/dom";
import type { TerminalInteraction } from "./terminal-interactions";

export type TerminalInteractionRun = {
  key: string;
  uri: string;
  row: number;
  col: number;
  width: number;
  text: string;
  metadata: TerminalInteraction;
};

export function terminalInteractionAt(
  core: TerminalCore,
  row: number,
  col: number,
): string | undefined {
  const history = core.getScrollbackCount();
  if (
    row < 0 ||
    row >= history + core.getRows() ||
    col < 0 ||
    col >= core.getCols()
  )
    return undefined;
  return (
    row < history
      ? core.getScrollbackCell(history - row - 1, col)
      : core.getCell(row - history, col)
  ).linkUri;
}

// Read public core cells, rather than inferring character offsets from DOM text.
// This keeps wide glyphs, combining marks, wraps, and virtualized history aligned.
export function visibleTerminalInteractions(
  core: TerminalCore,
  registry: ReadonlyMap<string, TerminalInteraction>,
  first: number,
  last: number,
): TerminalInteractionRun[] {
  const runs: TerminalInteractionRun[] = [];
  if (registry.size === 0) return runs;
  const history = core.getScrollbackCount();
  for (
    let row = Math.max(0, first);
    row < Math.min(last, history + core.getRows());
    row++
  ) {
    let run: TerminalInteractionRun | undefined;
    for (let col = 0; col < core.getCols(); col++) {
      const cell =
        row < history
          ? core.getScrollbackCell(history - row - 1, col)
          : core.getCell(row - history, col);
      const uri = cell.linkUri;
      const metadata = uri ? registry.get(uri) : undefined;
      if (!uri || !metadata) {
        run = undefined;
        continue;
      }
      if (!run || run.uri !== uri) {
        run = {
          key: `${uri}:${row}:${col}`,
          uri,
          metadata,
          row,
          col,
          width: 0,
          text: "",
        };
        runs.push(run);
      }
      run.width++;
      if (cell.width !== 0)
        run.text +=
          cell.chars ?? (cell.char ? String.fromCodePoint(cell.char) : " ");
    }
  }
  return runs;
}

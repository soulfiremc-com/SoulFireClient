import assert from "node:assert/strict";
import { test } from "node:test";
import { flavorEntries } from "@catppuccin/palette";
import {
  contrastRatio,
  readableTerminalColor,
  TERMINAL_TEXT_CONTRAST,
} from "@/lib/terminal-colors";
import { assertDefined } from "@/lib/assert-defined";

test("contrastRatio matches the WCAG extremes", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
});

test("readableTerminalColor keeps colors that already pass", () => {
  assert.equal(
    readableTerminalColor("#d20f39", "#ffffff", "#000000"),
    "#d20f39",
  );
});

test("readableTerminalColor lifts every Catppuccin ANSI color to AA", () => {
  for (const [name, { colors }] of flavorEntries) {
    for (const key of ["red", "green", "yellow", "blue", "pink", "teal"]) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
      const original = colors[key as keyof typeof colors].hex;
      const result = readableTerminalColor(
        original,
        colors.base.hex,
        colors.text.hex,
      );
      assert.ok(
        contrastRatio(result, colors.base.hex) >= TERMINAL_TEXT_CONTRAST,
        `${name} ${key} ${result}`,
      );
    }
  }
});

test("readableTerminalColor makes the smallest change toward the text color", () => {
  const latte = assertDefined(
    flavorEntries.find(([name]) => name === "latte"),
    "Expected flavorEntries.find(([name]) => name === latte) to exist",
  )[1].colors;
  const result = readableTerminalColor(
    latte.yellow.hex,
    latte.base.hex,
    latte.text.hex,
  );
  assert.notEqual(result, latte.text.hex);
  assert.ok(
    contrastRatio(result, latte.base.hex) < TERMINAL_TEXT_CONTRAST + 0.2,
  );
});

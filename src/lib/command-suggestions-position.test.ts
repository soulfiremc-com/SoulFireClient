import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommandSuggestionsPosition } from "./command-suggestions-position";

test("suggestions above a low command field fit vertically and horizontally", () => {
  const position = getCommandSuggestionsPosition(
    { left: 551, top: 346, bottom: 378 },
    { width: 780, height: 493 },
  );
  assert.equal(position.above, true);
  assert.ok(position.top < 346);
  assert.ok(position.top - position.maxHeight >= 8);
  assert.ok(position.left + position.width <= 772);
});

test("a high command field keeps suggestions below when there is room", () => {
  const position = getCommandSuggestionsPosition(
    { left: 100, top: 30, bottom: 62 },
    { width: 780, height: 493 },
  );
  assert.equal(position.above, false);
  assert.ok(position.top > 62);
  assert.ok(position.top + position.maxHeight <= 485);
  assert.equal(position.left, 100);
});

test("a narrow and short viewport constrains the popup on its available side", () => {
  const position = getCommandSuggestionsPosition(
    { left: 190, top: 40, bottom: 72 },
    { width: 200, height: 120 },
  );
  assert.ok(position.left >= 8);
  assert.ok(position.left + position.width <= 192);
  assert.ok(position.width > 0);
  assert.ok(position.maxHeight > 0);
  assert.ok(
    position.above
      ? position.top - position.maxHeight >= 8
      : position.top + position.maxHeight <= 112,
  );
});

test("a caret scrolled past the left edge retains a viewport gutter", () => {
  const position = getCommandSuggestionsPosition(
    { left: -200, top: 30, bottom: 62 },
    { width: 780, height: 493 },
  );
  assert.equal(position.left, 8);
});

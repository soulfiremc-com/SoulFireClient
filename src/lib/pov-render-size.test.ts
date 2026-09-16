import assert from "node:assert/strict";
import { test } from "node:test";
import { povRenderSize } from "./pov-render-size.ts";

test("POV sizing follows display density and preserves aspect ratio at server limits", () => {
  for (const [width, height, dpr, expectedWidth, expectedHeight] of [
    [640, 360, 1, 640, 360],
    [640, 360, 2, 1280, 720],
    [640, 360, 1.25, 800, 450],
    [1600, 900, 2, 1920, 1080],
    [2560, 1080, 1, 1920, 810],
    [600, 1000, 2, 648, 1080],
    [0.25, 0.25, 1, 1, 1],
  ]) {
    assert.deepEqual(povRenderSize(width, height, dpr), {
      width: expectedWidth,
      height: expectedHeight,
    });
  }
});

test("hidden and invalid viewports do not request a render", () => {
  for (const [width, height, dpr] of [
    [0, 360, 1],
    [640, 0, 1],
    [-1, 360, 1],
    [640, 360, 0],
    [Number.NaN, 360, 1],
    [640, Number.POSITIVE_INFINITY, 1],
  ]) {
    assert.equal(povRenderSize(width, height, dpr), null);
  }
});

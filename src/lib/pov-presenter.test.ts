import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { PovFrameSchema } from "@/generated/soulfire/pov_pb";
import { PovPresenter } from "./pov-presenter";

test("paced presentation keeps only the newest frame and closes replaced frames", () => {
  let scheduled: FrameRequestCallback | undefined;
  let closes = 0;
  let clones = 0;
  let draws = 0;
  const frame = {
    clone() {
      clones++;
      return {
        close() {
          closes++;
        },
      };
    },
  } as unknown as VideoFrame;
  const presenter = new PovPresenter(
    (_frame, metadata) => {
      draws++;
      assert.equal(metadata.sequence, 2n);
    },
    (callback) => {
      scheduled = callback;
      return 1;
    },
    () => {
      scheduled = undefined;
    },
    true,
  );
  presenter.present(frame, create(PovFrameSchema, { sequence: 1n }));
  presenter.present(frame, create(PovFrameSchema, { sequence: 2n }));
  assert.equal(clones, 2);
  assert.equal(closes, 1);
  assert.equal(draws, 0);
  scheduled?.(0);
  assert.equal(draws, 1);
  assert.equal(closes, 2);
  presenter.present(frame, create(PovFrameSchema));
  presenter.reset();
  assert.equal(closes, 3);
  assert.equal(scheduled, undefined);
});

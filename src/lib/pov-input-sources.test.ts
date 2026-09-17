import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  PovInputEvent_Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";
import { PovInputSources } from "./pov-input-sources";

test("input devices share held keys without releasing each other", () => {
  const sources = new PovInputSources();
  const key = (action: number) =>
    create(PovInputEventSchema, {
      kind: PovInputEvent_Kind.KEY,
      code: 87,
      action,
    });
  assert.equal(sources.accept(key(1), "keyboard"), true);
  assert.equal(sources.accept(key(1), "gamepad"), false);
  assert.equal(sources.accept(key(0), "keyboard"), false);
  assert.equal(sources.accept(key(0), "gamepad"), true);
  assert.equal(sources.accept(key(0), "gamepad"), false);
  sources.accept(key(1), "touch");
  sources.reset();
  assert.equal(sources.accept(key(1), "touch"), true);
});

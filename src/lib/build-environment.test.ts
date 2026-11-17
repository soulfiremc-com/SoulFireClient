import assert from "node:assert/strict";
import { test } from "node:test";
import { getBuildEnvironment } from "./build-environment.ts";

test("preview builds use the preview channel", () => {
  assert.equal(getBuildEnvironment("preview"), "preview");
});

test("dev server builds use the development channel", () => {
  assert.equal(getBuildEnvironment("development"), "development");
});

test("production and other modes use the production channel", () => {
  for (const mode of ["production", "test", ""]) {
    assert.equal(getBuildEnvironment(mode), "production", mode);
  }
});

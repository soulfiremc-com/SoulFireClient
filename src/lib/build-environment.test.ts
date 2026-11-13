import assert from "node:assert/strict";
import { test } from "node:test";
import { getBuildEnvironment } from "./build-environment.ts";

test("Cloudflare main and feature builds use the preview channel", () => {
  for (const branch of ["main", "fix/demo", undefined]) {
    assert.equal(
      getBuildEnvironment({
        CF_PAGES: "1",
        CF_PAGES_BRANCH: branch,
        NODE_ENV: "production",
      }),
      "preview",
    );
  }
});

test("Cloudflare release and demo builds use the production channel", () => {
  for (const branch of ["release", "demo"]) {
    assert.equal(
      getBuildEnvironment({ CF_PAGES: "1", CF_PAGES_BRANCH: branch }),
      "production",
    );
  }
});

test("local and desktop builds keep their existing environment detection", () => {
  assert.equal(getBuildEnvironment({}), "development");
  assert.equal(getBuildEnvironment({ NODE_ENV: "development" }), "development");
  assert.equal(getBuildEnvironment({ NODE_ENV: "production" }), "production");
  assert.equal(
    getBuildEnvironment({ CF_PAGES_BRANCH: "main", NODE_ENV: "production" }),
    "production",
  );
});

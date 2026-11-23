import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveAppProtocolPath } from "./app-protocol";

async function setup(context: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "soulfire-protocol-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const distRoot = path.join(directory, "dist");
  await mkdir(path.join(distRoot, "assets"), { recursive: true });
  await writeFile(path.join(distRoot, "index.html"), "<!doctype html>");
  await writeFile(path.join(distRoot, "assets", "app file.js"), "");
  // A sibling with the same prefix as the root must stay unreachable.
  await mkdir(`${distRoot}-secret`);
  await writeFile(path.join(`${distRoot}-secret`, "key.txt"), "secret");
  await writeFile(path.join(directory, "secret.txt"), "secret");
  return distRoot;
}

test("build files and app routes resolve inside the dist directory", async (context) => {
  const distRoot = await setup(context);
  const index = path.join(distRoot, "index.html");
  assert.equal(
    await resolveAppProtocolPath("app://soulfire/", distRoot),
    index,
  );
  assert.equal(
    await resolveAppProtocolPath(
      "app://soulfire/instance/abc/scripts",
      distRoot,
    ),
    index,
  );
  assert.equal(
    await resolveAppProtocolPath(
      "app://soulfire/assets/app%20file.js",
      distRoot,
    ),
    path.join(distRoot, "assets", "app file.js"),
  );
  assert.equal(
    await resolveAppProtocolPath("app://soulfire/assets/missing.js", distRoot),
    null,
  );
});

test("traversal, malformed escapes, and other origins are not served", async (context) => {
  const distRoot = await setup(context);
  for (const url of [
    "app://soulfire/../secret.txt",
    "app://soulfire/%2e%2e/secret.txt",
    "app://soulfire/assets/..%2f..%2fsecret.txt",
    "app://soulfire/assets/..%5c..%5csecret.txt",
    "app://soulfire/..%2fdist-secret%2fkey.txt",
    "app://soulfire/%E0%A4%A.js",
    "app://soulfire/%.js",
    "app://evil/index.html",
    "http://soulfire/index.html",
    "file:///etc/passwd",
    // oxlint-disable-next-line eslint/no-script-url -- Verify that script URLs are rejected.
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.equal(await resolveAppProtocolPath(url, distRoot), null, url);
  }
});

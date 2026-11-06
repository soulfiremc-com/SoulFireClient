import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { preserveLegacyAppPaths } from "./app-paths";

test("the display rename keeps the existing profile and Chromium session directory", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "soulfire-brand-paths-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = new Map([
    ["userData", path.join(root, "Soulfire")],
    ["sessionData", path.join(root, "Soulfire")],
  ]);
  preserveLegacyAppPaths({
    getPath: (name) => paths.get(name) ?? "",
    setPath: (name, value) => paths.set(name, value),
  });
  assert.equal(paths.get("userData"), path.join(root, "SoulFire"));
  assert.equal(paths.get("sessionData"), path.join(root, "SoulFire"));
  assert.equal(existsSync(path.join(root, "SoulFire")), true);
});

for (const directory of ["SoulFire", "soulfire", "custom-profile"]) {
  test(`the rename preserves the ${directory} data path`, () => {
    const updates: string[] = [];
    preserveLegacyAppPaths({
      getPath: () => path.join("profiles", directory),
      setPath: (name) => updates.push(name),
    });
    assert.deepEqual(updates, []);
  });
}

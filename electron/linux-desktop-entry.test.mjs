import assert from "node:assert/strict";
import test from "node:test";

import packageJson from "../package.json" with { type: "json" };

test("Linux packaging metadata keeps shell integration and targets aligned", () => {
  const desktopName = packageJson.desktopName;
  const appId = packageJson.build.appId;
  const linuxTargets = packageJson.build.linux.target ?? [];
  const startupWmClass = packageJson.build.linux.desktop.entry.StartupWMClass;
  const flatpakBuildScript = packageJson.scripts["build:electron:flatpak"];

  assert.equal(desktopName, `${packageJson.name}.desktop`);
  assert.equal(startupWmClass, packageJson.name);
  assert.ok(linuxTargets.includes("rpm"));
  assert.ok(linuxTargets.includes("pacman"));
  assert.ok(
    flatpakBuildScript.includes(
      `-c.extraMetadata.desktopName=${appId}.desktop`,
    ),
  );
});

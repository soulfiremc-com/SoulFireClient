import { mkdirSync } from "node:fs";
import path from "node:path";
import type { App } from "electron";

export function preserveLegacyAppPaths(
  app: Pick<App, "getPath" | "setPath">,
): void {
  const userData = app.getPath("userData");
  if (path.basename(userData) !== "Soulfire") return;

  // Product-name casing must not move existing profiles on case-sensitive disks.
  const legacyUserData = path.join(path.dirname(userData), "SoulFire");
  mkdirSync(legacyUserData, { recursive: true });
  app.setPath("userData", legacyUserData);
  app.setPath("sessionData", legacyUserData);
}

export function getAppConfigDir(app: App): string {
  return path.join(app.getPath("userData"), "config");
}

export function getAppLocalDataDir(app: App): string {
  return path.join(app.getPath("userData"), "local-data");
}

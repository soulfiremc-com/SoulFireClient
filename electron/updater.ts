import { app } from "electron";
import electronLog from "electron-log";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

function normalizeUpdaterPlatform(
  platformName: NodeJS.Platform,
): NodeJS.Platform | null {
  switch (platformName) {
    case "darwin":
    case "linux":
    case "win32":
      return platformName;
    default:
      return null;
  }
}

function normalizeUpdaterArch(archName: string): string | null {
  switch (archName) {
    case "arm64":
      return "arm64";
    case "x64":
      return "x64";
    default:
      return null;
  }
}

function getUpdaterTarget(): {
  arch: string;
  platform: NodeJS.Platform;
} | null {
  const platformName = normalizeUpdaterPlatform(process.platform);
  const archName = normalizeUpdaterArch(process.arch);
  if (platformName === null || archName === null) {
    return null;
  }

  return {
    arch: archName,
    platform: platformName,
  };
}

export function startUpdater(): void {
  if (
    !app.isPackaged ||
    process.env.SOULFIRE_DISABLE_UPDATER !== undefined ||
    process.env.SF_ELECTRON_DISABLE_UPDATER !== undefined
  ) {
    return;
  }

  const updaterTarget = getUpdaterTarget();
  if (updaterTarget === null) {
    electronLog.warn(
      "Skipping updater because the current platform/arch is unsupported",
      {
        arch: process.arch,
        platform: process.platform,
      },
    );
    return;
  }

  electronLog.transports.file.level = "info";
  autoUpdater.logger = electronLog;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on("checking-for-update", () => {
    electronLog.info("Checking for updates", updaterTarget);
  });
  autoUpdater.on("update-available", (info) => {
    electronLog.info("Update available", info);
  });
  autoUpdater.on("update-not-available", (info) => {
    electronLog.info("No update available", info);
  });
  autoUpdater.on("download-progress", (progress) => {
    electronLog.info("Update download progress", progress);
  });
  autoUpdater.on("update-downloaded", (info) => {
    electronLog.info("Update downloaded, installing now", info);
    if (process.platform === "win32") {
      autoUpdater.quitAndInstall(true, true);
      return;
    }

    autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (error) => {
    electronLog.error("Auto-update failed", error);
  });

  // The "error" handler above logs failed checks, for example when the device
  // is offline. The promise still rejects, so catch it to avoid an unhandled
  // rejection in the main process.
  autoUpdater.checkForUpdates().catch(() => {});
}

import { app, type BrowserWindow, dialog } from "electron";
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

function installUpdateNow(): void {
  if (process.platform === "win32") {
    autoUpdater.quitAndInstall(true, true);
    return;
  }

  autoUpdater.quitAndInstall();
}

// Restarting stops running bots and the integrated server, so ask first. If
// the user waits, the update installs the next time they quit.
async function promptToInstall(
  window: BrowserWindow | null,
  version: string,
): Promise<void> {
  const options: Electron.MessageBoxOptions = {
    buttons: ["Restart now", "Later"],
    cancelId: 1,
    defaultId: 0,
    detail:
      "Restarting stops running bots and the integrated server. If you choose Later, SoulFire installs the update when you quit.",
    message: `SoulFire ${version} is ready to install`,
    title: "Update ready",
    type: "info",
  };
  const { response } =
    window === null || window.isDestroyed()
      ? await dialog.showMessageBox(options)
      : await dialog.showMessageBox(window, options);

  if (response === 0) {
    installUpdateNow();
    return;
  }

  autoUpdater.autoInstallOnAppQuit = true;
}

export function startUpdater(getMainWindow: () => BrowserWindow | null): void {
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
  const setProgress = (value: number) => {
    const window = getMainWindow();
    if (window !== null && !window.isDestroyed()) window.setProgressBar(value);
  };
  autoUpdater.on("download-progress", (progress) => {
    electronLog.info("Update download progress", progress);
    setProgress(progress.percent / 100);
  });
  autoUpdater.on("update-downloaded", (info) => {
    electronLog.info("Update downloaded", info);
    setProgress(-1);
    promptToInstall(getMainWindow(), info.version).catch((error: unknown) => {
      electronLog.error("Could not show the update prompt", error);
      autoUpdater.autoInstallOnAppQuit = true;
    });
  });
  autoUpdater.on("error", (error) => {
    electronLog.error("Auto-update failed", error);
    setProgress(-1);
  });

  // The "error" handler above logs failed checks, for example when the device
  // is offline. The promise still rejects, so catch it to avoid an unhandled
  // rejection in the main process.
  autoUpdater.checkForUpdates().catch(() => {});
}

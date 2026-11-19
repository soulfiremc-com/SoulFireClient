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
    case "win32": {
      return platformName;
    }
    case "aix":
    case "android":
    case "cygwin":
    case "freebsd":
    case "haiku":
    case "netbsd":
    case "openbsd":
    case "sunos":
    default: {
      return null;
    }
  }
}

function normalizeUpdaterArch(archName: string): string | null {
  switch (archName) {
    case "arm64": {
      return "arm64";
    }
    case "x64": {
      return "x64";
    }
    default: {
      return null;
    }
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

let readyVersion: string | null = null;

/** The downloaded update waiting for a restart, if any. */
export function getReadyUpdateVersion(): string | null {
  return readyVersion;
}

export function installUpdateNow(): void {
  if (readyVersion === null) return;
  if (process.platform === "win32") {
    autoUpdater.quitAndInstall(true, true);
    return;
  }

  autoUpdater.quitAndInstall();
}

// Fallback when no app window can show the translated prompt. Restarting stops
// running bots and the integrated server, so ask first.
async function promptToInstall(version: string): Promise<void> {
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
  const { response } = await dialog.showMessageBox(options);
  if (response === 0) installUpdateNow();
}

/**
 * Starts background updates. When an update finishes downloading, it installs
 * on quit, and `notifyReady` lets the app window ask the user to restart now.
 * Without a window, a native dialog asks instead.
 */
export function startUpdater(
  getMainWindow: () => BrowserWindow | null,
  notifyReady: (version: string) => void,
): void {
  if (
    !app.isPackaged ||
    process.env["SOULFIRE_DISABLE_UPDATER"] !== undefined ||
    process.env["SF_ELECTRON_DISABLE_UPDATER"] !== undefined
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
    readyVersion = info.version;
    autoUpdater.autoInstallOnAppQuit = true;
    const window = getMainWindow();
    if (window !== null && !window.isDestroyed()) {
      notifyReady(info.version);
      return;
    }
    promptToInstall(info.version).catch((error: unknown) => {
      electronLog.error("Could not show the update prompt", error);
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

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  shell,
  Tray,
} from "electron";
import Store from "electron-store";
import type {
  DesktopFsWatchOptions,
  DesktopOpenDialogOptions,
  DesktopSaveDialogOptions,
  DesktopTheme,
} from "../src/lib/desktop-api";
import { getAppConfigDir, getAppLocalDataDir } from "./native/app-paths";
import { CastManager } from "./native/cast";
import { DiscordPresenceManager } from "./native/discord";
import {
  getSoulFireServerVersion,
  importCustomSoulFireServerJar,
  listCustomSoulFireServerJars,
  removeCustomSoulFireServerJar,
  resetIntegratedData,
  runIntegratedServer,
} from "./native/integrated-server";
import {
  captureIntegratedThreadDump,
  getIntegratedDiagnostics,
  integratedDataDirectory,
  validateJcmd,
} from "./native/integrated-server-diagnostics";
import {
  createIntegratedServerState,
  killIntegratedServer,
} from "./native/integrated-server-process";
import { trayGuidForPlatform } from "./tray-args";
import { startUpdater } from "./updater";

const APP_ID = "com.soulfiremc.soulfire";
const APP_PROTOCOL = "app";
const APP_PROTOCOL_HOST = "soulfire";
const DEEP_LINK_PREFIX = "soulfire://";
const DEFAULT_WINDOW_HEIGHT = 675;
const DEFAULT_WINDOW_WIDTH = 1200;
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
]);

type StoredWindowState = {
  height: number;
  isMaximized: boolean;
  width: number;
};

type FsWatchRegistration = {
  changedPaths: Set<string>;
  debounceTimer: NodeJS.Timeout | null;
  ownerContentsId: number;
  watcher: ReturnType<typeof chokidar.watch>;
};

const windowStateStore = new Store<{
  window: StoredWindowState;
}>({
  defaults: {
    window: {
      height: DEFAULT_WINDOW_HEIGHT,
      isMaximized: false,
      width: DEFAULT_WINDOW_WIDTH,
    },
  },
  name: "window-state",
});

const integratedServerState = createIntegratedServerState();
const discordPresence = new DiscordPresenceManager();
const castManager = new CastManager((event, payload) => {
  switch (event) {
    case "cast-device-disconnected":
      sendToMainWindow("cast:device-disconnected", payload);
      return;
    case "cast-device-discovered":
      sendToMainWindow("cast:device-discovered", payload);
      return;
    case "cast-device-removed":
      sendToMainWindow("cast:device-removed", payload);
      return;
    default:
      return;
  }
});

const fsWatchers = new Map<number, FsWatchRegistration>();
const devServerUrl = process.env.VITE_DEV_SERVER_URL
  ? new URL(process.env.VITE_DEV_SERVER_URL)
  : null;
const hasSingleInstanceLock =
  !app.isPackaged || app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let nextFsWatchId = 1;
let pendingOpenUrl = findProtocolUrl(process.argv);
let tray: Tray | null = null;

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleOpenUrl(url);
});

if (hasSingleInstanceLock) {
  app.on("second-instance", (_event, argv) => {
    const protocolUrl = findProtocolUrl(argv);
    if (protocolUrl !== null) {
      handleOpenUrl(protocolUrl);
    } else {
      focusMainWindow();
    }
  });
} else {
  app.quit();
}

function preloadPath(): string {
  return path.join(app.getAppPath(), "dist-electron", "preload.mjs");
}

function appOrigin(): string {
  return `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}`;
}

function appUrl(pathname = "/"): string {
  return `${appOrigin()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function rendererEntryUrl(): string {
  return devServerUrl?.toString() ?? appUrl("/");
}

function resolveAssetPath(relativePath: string): string {
  const basePath = app.isPackaged ? app.getAppPath() : process.cwd();
  return path.join(basePath, relativePath);
}

function loadNativeImage(assetPath: string) {
  const image = nativeImage.createFromPath(assetPath);
  if (image.isEmpty()) {
    throw new Error(`Failed to load icon asset: ${assetPath}`);
  }

  return image;
}

function appIconPath(): string {
  switch (process.platform) {
    case "darwin":
      return resolveAssetPath("build/icons/icon.png");
    case "win32":
      return resolveAssetPath("build/icons/icon.ico");
    default:
      return resolveAssetPath("build/icons/icon.png");
  }
}

function trayIconPath(): string {
  switch (process.platform) {
    case "darwin":
      return resolveAssetPath("build/icons/trayTemplate.png");
    case "win32":
      return resolveAssetPath("build/icons/icon.ico");
    default:
      return resolveAssetPath("build/icons/icon.png");
  }
}

function windowIcon() {
  if (process.platform === "darwin") {
    return undefined;
  }

  return process.platform === "win32"
    ? appIconPath()
    : loadNativeImage(appIconPath());
}

function applyApplicationIcon(): void {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(loadNativeImage(appIconPath()));
  }
}

function sendToMainWindow(channel: string, payload?: unknown): void {
  if (mainWindow === null || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  void mainWindow.focus();
}

function handleOpenUrl(url: string): void {
  pendingOpenUrl = url;
  focusMainWindow();
  flushPendingOpenUrl();
}

function flushPendingOpenUrl(): void {
  if (
    pendingOpenUrl === null ||
    mainWindow === null ||
    mainWindow.webContents.isDestroyed() ||
    mainWindow.webContents.isLoadingMainFrame()
  ) {
    return;
  }

  sendToMainWindow("app:open-url", pendingOpenUrl);
  pendingOpenUrl = null;
}

function findProtocolUrl(argv: string[]): string | null {
  return argv.find((value) => value.startsWith(DEEP_LINK_PREFIX)) ?? null;
}

function isAllowedRendererUrl(target: string): boolean {
  try {
    const parsedUrl = new URL(target);

    if (
      parsedUrl.protocol === `${APP_PROTOCOL}:` &&
      parsedUrl.host === APP_PROTOCOL_HOST
    ) {
      return true;
    }

    if (devServerUrl !== null && parsedUrl.origin === devServerUrl.origin) {
      return true;
    }
  } catch {}

  return false;
}

function isSafeExternalUrl(target: string): boolean {
  try {
    const parsedUrl = new URL(target);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "mailto:";
  } catch {
    return false;
  }
}

function validateIpcSender(event: IpcMainInvokeEvent): BrowserWindow {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const senderFrame = event.senderFrame;
  const senderUrl = senderFrame?.url || event.sender.getURL();
  const isMainFrame =
    senderFrame !== null &&
    senderFrame.routingId === event.sender.mainFrame.routingId;

  if (
    senderWindow === null ||
    senderWindow !== mainWindow ||
    !isMainFrame ||
    !isAllowedRendererUrl(senderUrl)
  ) {
    throw new Error(`Blocked IPC from untrusted sender: ${senderUrl}`);
  }

  return senderWindow;
}

async function resolveAppProtocolPath(
  requestUrl: string,
): Promise<string | null> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== `${APP_PROTOCOL}:` ||
    parsedUrl.host !== APP_PROTOCOL_HOST
  ) {
    return null;
  }

  const distRoot = path.join(app.getAppPath(), "dist");
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(
    distRoot,
    path.extname(relativePath) ? relativePath : "index.html",
  );
  const normalizedRoot = `${distRoot}${path.sep}`;

  if (filePath !== distRoot && !filePath.startsWith(normalizedRoot)) {
    return null;
  }

  try {
    const fileInfo = await stat(filePath);
    return fileInfo.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function registerAppProtocol(): Promise<void> {
  await protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = await resolveAppProtocolPath(request.url);
    if (filePath === null) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function registerSecurityHandlers(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });

    contents.on("will-navigate", (event, navigationUrl) => {
      if (!isAllowedRendererUrl(navigationUrl)) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    contents.on("destroyed", () => {
      cleanupFsWatchesForContents(contents.id);
    });
  });
}

async function createMainWindow(): Promise<BrowserWindow> {
  const state = app.isPackaged
    ? loadStoredWindowState()
    : {
        height: DEFAULT_WINDOW_HEIGHT,
        isMaximized: false,
        width: DEFAULT_WINDOW_WIDTH,
      };

  const window = new BrowserWindow({
    backgroundColor: "#111418",
    center: true,
    frame: false,
    height: state.height,
    icon: windowIcon(),
    minHeight: 500,
    minWidth: 940,
    show: false,
    title: "SoulFire",
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath(),
      sandbox: true,
    },
    width: state.width,
  });
  mainWindow = window;

  if (state.isMaximized) {
    window.maximize();
  }

  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("close", () => {
    void killIntegratedServer(integratedServerState);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.on("resize", () => {
    sendToMainWindow("window:resized");
    persistWindowState(window);
  });
  window.on("maximize", () => {
    persistWindowState(window);
  });
  window.on("unmaximize", () => {
    persistWindowState(window);
  });
  window.webContents.on("did-finish-load", () => {
    flushPendingOpenUrl();
  });

  await window.loadURL(rendererEntryUrl());

  return window;
}

function loadStoredWindowState(): StoredWindowState {
  const state = windowStateStore.get("window");
  return {
    height:
      typeof state.height === "number" && state.height >= 500
        ? state.height
        : DEFAULT_WINDOW_HEIGHT,
    isMaximized: state.isMaximized,
    width:
      typeof state.width === "number" && state.width >= 940
        ? state.width
        : DEFAULT_WINDOW_WIDTH,
  };
}

function persistWindowState(window: BrowserWindow): void {
  if (!app.isPackaged || window.isDestroyed()) {
    return;
  }

  const bounds = window.getBounds();
  const current = windowStateStore.get("window");
  windowStateStore.set("window", {
    height: window.isMaximized() ? current.height : bounds.height,
    isMaximized: window.isMaximized(),
    width: window.isMaximized() ? current.width : bounds.width,
  });
}

function createAppTray(): void {
  const iconPath = trayIconPath();
  const image =
    process.platform === "win32" ? iconPath : loadNativeImage(iconPath);
  if (process.platform === "darwin" && typeof image !== "string") {
    image.setTemplateImage(true);
  }
  const trayGuid = trayGuidForPlatform(process.platform);
  tray = trayGuid === null ? new Tray(image) : new Tray(image, trayGuid);
  tray.setToolTip("SoulFire");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        click: () => {
          focusMainWindow();
        },
        label: "Open SoulFire",
      },
      {
        click: () => {
          app.quit();
        },
        label: "Quit",
      },
    ]),
  );
  tray.on("click", () => {
    focusMainWindow();
  });
}

function handleIpc<Args extends unknown[], Result>(
  channel: string,
  handler: (
    senderWindow: BrowserWindow,
    ...args: Args
  ) => Result | Promise<Result>,
): void {
  ipcMain.handle(channel, (event, ...args: Args) => {
    const senderWindow = validateIpcSender(event);
    return handler(senderWindow, ...args);
  });
}

function registerIpcHandlers(): void {
  handleIpc("app:quit", async () => {
    app.quit();
  });

  handleIpc("app:set-theme", async (_window, theme: DesktopTheme) => {
    setThemeSource(theme);
  });

  handleIpc("cast:broadcast", async (_window, payload?: unknown) => {
    castManager.broadcastMessage(payload);
  });

  handleIpc(
    "cast:connect",
    async (
      _window,
      options: {
        address: string;
        port: number;
      },
    ) => {
      return castManager.connect(options.address, options.port);
    },
  );

  handleIpc("cast:discover", async () => {
    castManager.discover();
  });

  handleIpc("cast:get-devices", async () => {
    return castManager.getCasts();
  });

  handleIpc(
    "dialog:open",
    async (senderWindow, options: DesktopOpenDialogOptions) => {
      return openDialog(senderWindow, options);
    },
  );

  handleIpc(
    "dialog:save",
    async (senderWindow, options: DesktopSaveDialogOptions) => {
      return saveDialog(senderWindow, options);
    },
  );

  handleIpc(
    "discord:update-activity",
    async (_window, state: string, details?: string | null) => {
      return discordPresence.update(state, details);
    },
  );

  handleIpc(
    "fs:mkdir",
    async (
      _window,
      targetPath: string,
      options?: {
        recursive?: boolean;
      },
    ) => {
      await mkdir(targetPath, {
        recursive: options?.recursive ?? false,
      });
    },
  );

  handleIpc("fs:read-dir", async (_window, targetPath: string) => {
    const entries = await readdir(targetPath, {
      withFileTypes: true,
    });

    return entries.map((entry) => ({
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymlink: entry.isSymbolicLink(),
      name: entry.name,
    }));
  });

  handleIpc("fs:read-text-file", async (_window, targetPath: string) => {
    return readFile(targetPath, "utf8");
  });

  handleIpc(
    "fs:watch",
    async (
      senderWindow,
      targetPath: string,
      options?: DesktopFsWatchOptions,
    ) => {
      const watchId = nextFsWatchId++;
      const ownerContentsId = senderWindow.webContents.id;

      const registration: FsWatchRegistration = {
        changedPaths: new Set<string>(),
        debounceTimer: null,
        ownerContentsId,
        watcher: chokidar.watch(targetPath, {
          depth: options?.recursive === false ? 0 : undefined,
          ignoreInitial: true,
          persistent: true,
        }),
      };
      const delayMs = options?.delayMs ?? 0;

      const flush = () => {
        if (registration.changedPaths.size === 0) {
          return;
        }

        sendToMainWindow(`fs:watch:${watchId}`, {
          paths: Array.from(registration.changedPaths),
        });
        registration.changedPaths.clear();
      };

      const queuePath = (changedPath: string) => {
        registration.changedPaths.add(changedPath);
        if (delayMs === 0) {
          flush();
          return;
        }

        if (registration.debounceTimer !== null) {
          clearTimeout(registration.debounceTimer);
        }
        registration.debounceTimer = setTimeout(flush, delayMs);
      };

      registration.watcher.on("add", queuePath);
      registration.watcher.on("addDir", queuePath);
      registration.watcher.on("change", queuePath);
      registration.watcher.on("unlink", queuePath);
      registration.watcher.on("unlinkDir", queuePath);

      fsWatchers.set(watchId, registration);

      return watchId;
    },
  );

  handleIpc("fs:unwatch", async (_window, watchId: number) => {
    cleanupFsWatch(watchId);
  });

  handleIpc(
    "fs:write-text-file",
    async (_window, targetPath: string, contents: string) => {
      await mkdir(path.dirname(targetPath), {
        recursive: true,
      });
      await writeFile(targetPath, contents, "utf8");
    },
  );

  handleIpc("integrated-server:get-version", async () => {
    return getSoulFireServerVersion(app, app.getVersion());
  });

  handleIpc("integrated-server:get-diagnostics", async () =>
    getIntegratedDiagnostics(app, integratedServerState),
  );
  handleIpc("integrated-server:open-data-directory", async () => {
    const directory = integratedDataDirectory(app, integratedServerState);
    await mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });
  handleIpc("integrated-server:select-jcmd", async (window) => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose jcmd from JDK 25",
      properties: ["openFile"],
    });
    const executable = result.filePaths[0];
    if (result.canceled || !executable) return null;
    await validateJcmd(executable);
    integratedServerState.jcmdPath = executable;
    return executable;
  });
  handleIpc("integrated-server:capture-thread-dump", async () =>
    captureIntegratedThreadDump(app, integratedServerState),
  );

  handleIpc("integrated-server:list-custom-jars", async () => {
    return listCustomSoulFireServerJars(app);
  });

  handleIpc(
    "integrated-server:import-custom-jar",
    async (_window, sourcePath: string) => {
      return importCustomSoulFireServerJar(app, sourcePath);
    },
  );

  handleIpc(
    "integrated-server:remove-custom-jar",
    async (_window, jarId: string) => {
      await removeCustomSoulFireServerJar(app, jarId);
    },
  );

  handleIpc("integrated-server:kill", async () => {
    await killIntegratedServer(integratedServerState);
  });

  handleIpc("integrated-server:reset-data", async () => {
    await killIntegratedServer(integratedServerState);
    await resetIntegratedData(app);
  });

  handleIpc(
    "integrated-server:run",
    async (
      _window,
      options: {
        jarSource?: {
          jarId?: string;
          type: "custom" | "official";
        };
        jvmArgs: string[];
      },
    ) => {
      return runIntegratedServer(
        app,
        integratedServerState,
        options.jvmArgs,
        options.jarSource?.type === "custom" && options.jarSource.jarId
          ? {
              jarId: options.jarSource.jarId,
              type: "custom",
            }
          : {
              type: "official",
            },
        app.getVersion(),
      ).then((credentials) => {
        if (credentials === null) return null;
        const [address, token] = credentials.split("\n");
        return {
          address,
          token,
        };
      });
    },
  );

  handleIpc("path:app-config-dir", async () => {
    return getAppConfigDir(app);
  });

  handleIpc("path:app-local-data-dir", async () => {
    return getAppLocalDataDir(app);
  });

  handleIpc("path:download-dir", async () => {
    return app.getPath("downloads");
  });

  handleIpc("path:resolve", async (_window, ...pathsToResolve: string[]) => {
    return path.resolve(...pathsToResolve);
  });

  handleIpc("shell:open-external", async (_window, target: string) => {
    if (!isSafeExternalUrl(target)) {
      throw new Error(`Blocked external URL: ${target}`);
    }

    await shell.openExternal(target);
  });

  handleIpc("shell:open-path", async (_window, target: string) => {
    return shell.openPath(target);
  });

  handleIpc("system:get-info", async () => {
    return {
      appVersion: app.getVersion(),
      os: {
        arch: process.arch,
        locale: app.getLocale(),
        platform: process.platform,
        type: mapPlatformToType(process.platform),
        version: os.release(),
      },
    };
  });

  handleIpc("window:close", async (senderWindow) => {
    senderWindow.close();
  });

  handleIpc("window:is-maximized", async (senderWindow) => {
    return senderWindow.isMaximized();
  });

  handleIpc("window:maximize", async (senderWindow) => {
    senderWindow.maximize();
  });

  handleIpc("window:minimize", async (senderWindow) => {
    senderWindow.minimize();
  });

  handleIpc("window:unmaximize", async (senderWindow) => {
    senderWindow.unmaximize();
  });
}

function cleanupFsWatch(watchId: number): void {
  const registration = fsWatchers.get(watchId);
  if (registration === undefined) {
    return;
  }

  fsWatchers.delete(watchId);
  if (registration.debounceTimer !== null) {
    clearTimeout(registration.debounceTimer);
  }
  void registration.watcher.close();
}

function cleanupFsWatchesForContents(contentsId: number): void {
  for (const [watchId, registration] of fsWatchers.entries()) {
    if (registration.ownerContentsId === contentsId) {
      cleanupFsWatch(watchId);
    }
  }
}

async function openDialog(
  window: BrowserWindow,
  options: DesktopOpenDialogOptions,
): Promise<string | string[] | null> {
  const result = await dialog.showOpenDialog(window, {
    defaultPath: options.defaultPath,
    filters: options.filters,
    properties: [
      ...(options.directory ? ["openDirectory"] : ["openFile"]),
      ...(options.multiple ? ["multiSelections"] : []),
    ] as Array<
      | "openDirectory"
      | "openFile"
      | "multiSelections"
      | "showHiddenFiles"
      | "createDirectory"
      | "promptToCreate"
      | "noResolveAliases"
      | "treatPackageAsDirectory"
      | "dontAddToRecent"
    >,
    title: options.title,
  });

  if (result.canceled) {
    return null;
  }

  return options.multiple ? result.filePaths : (result.filePaths[0] ?? null);
}

async function saveDialog(
  window: BrowserWindow,
  options: DesktopSaveDialogOptions,
): Promise<string | null> {
  const result = await dialog.showSaveDialog(window, {
    defaultPath: options.defaultPath,
    filters: options.filters,
    title: options.title,
  });

  if (result.canceled) {
    return null;
  }

  return result.filePath ?? null;
}

function setThemeSource(theme: DesktopTheme): void {
  nativeTheme.themeSource =
    theme === null ? "system" : theme === "dark" ? "dark" : "light";
}

function mapPlatformToType(platformName: string): string {
  switch (platformName) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    default:
      return platformName;
  }
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId(APP_ID);
  applyApplicationIcon();
  registerSecurityHandlers();
  registerIpcHandlers();
  await registerAppProtocol();

  app.on("before-quit", () => {
    castManager.dispose();
    void killIntegratedServer(integratedServerState);
  });

  mainWindow = await createMainWindow();
  createAppTray();
  startUpdater();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
      flushPendingOpenUrl();
    } else {
      focusMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

if (hasSingleInstanceLock) {
  void app.whenReady().then(bootstrap);
}

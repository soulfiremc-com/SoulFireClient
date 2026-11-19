import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { watch } from "chokidar";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  type NativeImage,
  net,
  protocol,
  type SaveDialogOptions,
  screen,
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
import {
  executeProviderRequest,
  type ProviderRequest,
} from "../src/lib/provider-request-policy";
import { CastSessionManager } from "./cast/session-manager";
import {
  CastDevice,
  CastSource,
  DEFAULT_SETTINGS,
  DisplaySettings,
} from "@soulfiremc/cast-protocol";
import { Option, Schema } from "effect";
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
import {
  getReadyUpdateVersion,
  installUpdateNow,
  startUpdater,
} from "./updater";

const APP_ID = "com.soulfiremc.soulfire";
const APP_PROTOCOL = "app";
const APP_PROTOCOL_HOST = "soulfire";
const DEEP_LINK_PREFIX = "soulfire://";
const DEFAULT_WINDOW_HEIGHT = 675;
const DEFAULT_WINDOW_WIDTH = 1200;
// Match --background in src/App.css so new and resized windows do not flash.
const DARK_WINDOW_BACKGROUND = "#090b0c";
const LIGHT_WINDOW_BACKGROUND = "#ffffff";
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
  x?: number | undefined;
  y?: number | undefined;
};

type StoredThemeSource = "dark" | "light" | "system";

type FsWatchRegistration = {
  changedPaths: Set<string>;
  debounceTimer: NodeJS.Timeout | null;
  ownerContentsId: number;
  watcher: ReturnType<typeof watch>;
};

const windowStateStore = new Store<{
  themeSource: StoredThemeSource;
  window: StoredWindowState;
}>({
  defaults: {
    themeSource: "system",
    window: {
      height: DEFAULT_WINDOW_HEIGHT,
      isMaximized: false,
      width: DEFAULT_WINDOW_WIDTH,
    },
  },
  name: "window-state",
});

const castSettingsStore = new Store<{ display: DisplaySettings }>({
  name: "cast-display",
  defaults: { display: DEFAULT_SETTINGS },
});

const integratedServerState = createIntegratedServerState();
const discordPresence = new DiscordPresenceManager();
const castManager = new CastSessionManager((state) => {
  sendToMainWindow("cast:state", state);
});

const fsWatchers = new Map<number, FsWatchRegistration>();
const devServerUrl = process.env["VITE_DEV_SERVER_URL"]
  ? new URL(process.env["VITE_DEV_SERVER_URL"])
  : null;
const hasSingleInstanceLock =
  !app.isPackaged || app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
const povWindows = new Map<number, BrowserWindow>();
const povInputOwners = new Map<
  number,
  { owner: BrowserWindow; target?: "pov" | undefined }
>();
let nextFsWatchId = 1;
let pendingOpenUrl = findProtocolUrl(process.argv);
let tray: Tray | null = null;
let appStarted = false;

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
    case "aix":
    case "android":
    case "cygwin":
    case "freebsd":
    case "haiku":
    case "linux":
    case "netbsd":
    case "openbsd":
    case "sunos":
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
    case "aix":
    case "android":
    case "cygwin":
    case "freebsd":
    case "haiku":
    case "linux":
    case "netbsd":
    case "openbsd":
    case "sunos":
    default:
      return resolveAssetPath("build/icons/icon.png");
  }
}

function windowIconOptions(): { icon?: string | NativeImage } {
  if (process.platform === "darwin") {
    return {};
  }

  return {
    icon:
      process.platform === "win32"
        ? appIconPath()
        : loadNativeImage(appIconPath()),
  };
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
    // On macOS the app keeps running after its window closes. Reopen it for
    // the tray, the Dock, and deep links.
    if (appStarted) {
      createMainWindow().catch((error: unknown) => {
        console.error("Could not reopen the SoulFire window", error);
      });
    }
    return;
  }

  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
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

function registerAppProtocol(): void {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = await resolveAppProtocolPath(request.url);
    if (filePath === null) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// Escape is reserved only while the focused window owns POV capture. Chromium
// handles pointer-lock Escape before DOM input, so intercept it at the native layer.
function updatePovEscapeShortcut(): void {
  globalShortcut.unregister("Escape");
  const focused = BrowserWindow.getFocusedWindow();
  if (!focused) return;
  const capture = povInputOwners.get(focused.webContents.id);
  if (!capture) return;
  globalShortcut.register("Escape", () => {
    if (
      focused.isDestroyed() ||
      !focused.isFocused() ||
      capture.owner.isDestroyed()
    )
      return;
    for (const action of [1, 0])
      capture.owner.webContents.send("pov:escape", {
        target: capture.target,
        action,
        modifiers: 0,
      });
  });
}

function registerSecurityHandlers(): void {
  app.on("browser-window-focus", updatePovEscapeShortcut);
  app.on("browser-window-blur", (_event, window) => {
    globalShortcut.unregister("Escape");
    const capture = povInputOwners.get(window.webContents.id);
    // Window managers can briefly blur a window while it enters fullscreen.
    // Drop the shortcut immediately; release gameplay if focus stays elsewhere.
    setTimeout(() => {
      if (
        window.isDestroyed() ||
        window.isFocused() ||
        !capture ||
        povInputOwners.get(window.webContents.id) !== capture
      )
        return;
      povInputOwners.delete(window.webContents.id);
      if (!capture.owner.isDestroyed())
        capture.owner.webContents.send("pov:released", capture.target);
    }, 100);
  });
  app.on("web-contents-created", (_event, contents) => {
    contents.on("destroyed", () => {
      povInputOwners.delete(contents.id);
      updatePovEscapeShortcut();
    });
    contents.on(
      "did-start-navigation",
      (_navigationEvent, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) {
          povInputOwners.delete(contents.id);
          updatePovEscapeShortcut();
        }
      },
    );
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });

    contents.on("will-navigate", (event, navigationUrl) => {
      if (!isAllowedRendererUrl(navigationUrl)) {
        event.preventDefault();
        // Plain links without target="_blank" should still open in the browser.
        if (isSafeExternalUrl(navigationUrl)) {
          void shell.openExternal(navigationUrl);
        }
      }
    });

    contents.on("context-menu", (_menuEvent, params) => {
      showEditContextMenu(contents, params);
    });

    contents.setWindowOpenHandler(({ url, frameName }) => {
      if (
        url === "about:blank" &&
        frameName === "soulfire-pov" &&
        isAllowedRendererUrl(contents.getURL())
      ) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            frame: false,
            backgroundColor: windowBackgroundColor(),
            ...windowIconOptions(),
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    contents.on("did-create-window", (child, details) => {
      if (details.frameName !== "soulfire-pov" || details.url !== "about:blank")
        return;
      povWindows.set(contents.id, child);
      const closeChild = () => {
        if (!child.isDestroyed()) child.close();
      };
      child.on("closed", () => {
        if (povWindows.get(contents.id) === child)
          povWindows.delete(contents.id);
        contents.removeListener("destroyed", closeChild);
      });
      child.on("resize", () => {
        if (!contents.isDestroyed()) contents.send("window:pov-resized");
      });
      contents.once("destroyed", closeChild);
    });

    contents.on("destroyed", () => {
      cleanupFsWatchesForContents(contents.id);
    });
  });
}

function showEditContextMenu(
  contents: Electron.WebContents,
  params: Electron.ContextMenuParams,
): void {
  const { editFlags, isEditable, selectionText } = params;
  const template: Electron.MenuItemConstructorOptions[] = isEditable
    ? [
        { role: "undo", enabled: editFlags.canUndo },
        { role: "redo", enabled: editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: editFlags.canCut },
        { role: "copy", enabled: editFlags.canCopy },
        { role: "paste", enabled: editFlags.canPaste },
        { type: "separator" },
        { role: "selectAll", enabled: editFlags.canSelectAll },
      ]
    : selectionText.trim().length > 0
      ? [{ role: "copy", enabled: editFlags.canCopy }]
      : [];
  if (template.length === 0) return;

  const window = BrowserWindow.fromWebContents(contents);
  Menu.buildFromTemplate(template).popup(window ? { window } : undefined);
}

function windowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors
    ? DARK_WINDOW_BACKGROUND
    : LIGHT_WINDOW_BACKGROUND;
}

function updateWindowBackgrounds(): void {
  const color = windowBackgroundColor();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.setBackgroundColor(color);
  }
}

async function createMainWindow(): Promise<BrowserWindow> {
  const state = app.isPackaged
    ? loadStoredWindowState()
    : {
        height: DEFAULT_WINDOW_HEIGHT,
        isMaximized: false,
        width: DEFAULT_WINDOW_WIDTH,
      };
  const position = visibleWindowPosition(state);

  const window = new BrowserWindow({
    backgroundColor: windowBackgroundColor(),
    center: position === null,
    frame: false,
    height: state.height,
    ...windowIconOptions(),
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
    ...position,
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
  window.on("move", () => {
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
    x: typeof state.x === "number" ? state.x : undefined,
    y: typeof state.y === "number" ? state.y : undefined,
  };
}

// Restore the saved position only while enough of the title bar is on a
// connected display. A monitor may have been removed since the last run.
function visibleWindowPosition(
  state: StoredWindowState,
): { x: number; y: number } | null {
  const { x, y } = state;
  if (x === undefined || y === undefined) return null;

  const minVisible = 100;
  const isVisible = screen.getAllDisplays().some(({ workArea }) => {
    const visibleWidth =
      Math.min(x + state.width, workArea.x + workArea.width) -
      Math.max(x, workArea.x);
    return (
      visibleWidth >= minVisible &&
      y >= workArea.y &&
      y < workArea.y + workArea.height - minVisible / 2
    );
  });

  return isVisible ? { x, y } : null;
}

function persistWindowState(window: BrowserWindow): void {
  if (!app.isPackaged || window.isDestroyed()) {
    return;
  }

  // Keep the restored bounds while maximized, minimized, or fullscreen so
  // unmaximizing on the next launch returns to the previous size and place.
  const isMaximized = window.isMaximized();
  if (window.isMinimized() || window.isFullScreen()) return;
  const current = windowStateStore.get("window");
  const bounds = isMaximized ? current : window.getBounds();
  windowStateStore.set("window", {
    height: bounds.height,
    isMaximized,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y,
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
        label: "Quit SoulFire",
      },
    ]),
  );
  tray.on("click", () => {
    focusMainWindow();
  });
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- each handler declares the argument types of its IPC channel
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

// The target comes from the renderer, so it is checked at runtime.
function windowTarget(sender: BrowserWindow, target: unknown): BrowserWindow {
  if (target === undefined) return sender;
  if (target !== "pov") throw new Error("Unknown window target");
  const popup = povWindows.get(sender.webContents.id);
  if (!popup || popup.isDestroyed()) throw new Error("POV window is closed");
  return popup;
}

function registerIpcHandlers(): void {
  handleIpc("providers:request", async (_window, request: ProviderRequest) => {
    return executeProviderRequest(request, (input, init) =>
      net.fetch(input, init),
    );
  });
  handleIpc(
    "pov:set-captured",
    (owner, captured: unknown, target?: unknown) => {
      if (
        typeof captured !== "boolean" ||
        (target !== undefined && target !== "pov")
      )
        throw new Error("Invalid POV capture");
      if (!captured) {
        for (const [id, capture] of povInputOwners) {
          if (capture.owner === owner && capture.target === target)
            povInputOwners.delete(id);
        }
        updatePovEscapeShortcut();
        return;
      }
      const window = windowTarget(owner, target);
      povInputOwners.set(window.webContents.id, { owner, target });
      updatePovEscapeShortcut();
      // Native shortcut registration is optional. Some compositors cannot reserve
      // bare Escape; pointer capture must still work with Chromium's fallback.
    },
  );
  handleIpc("app:quit", () => {
    app.quit();
  });

  handleIpc("updates:get-ready", () => getReadyUpdateVersion());
  handleIpc("updates:install-now", () => {
    installUpdateNow();
  });

  handleIpc("app:set-theme", (_window, theme: DesktopTheme) => {
    setThemeSource(theme);
  });

  handleIpc(
    "cast:connect",
    async (
      _window,
      options: { device: unknown; source: unknown; relaunch?: boolean },
    ) => {
      return castManager.connect(
        Schema.decodeUnknownSync(CastDevice)(options.device),
        Schema.decodeUnknownSync(CastSource)(options.source),
        options.relaunch === true,
      );
    },
  );
  handleIpc("cast:discover", () => {
    castManager.discover();
  });
  handleIpc("cast:get-state", () => castManager.getState());
  handleIpc("cast:stop", async (_window, id: string) => {
    await castManager.stop(id);
  });
  handleIpc("cast:stop-all", async () => {
    await castManager.stopAll();
  });
  handleIpc("cast:settings", (_window, settings: unknown) => {
    const next = Schema.decodeUnknownSync(DisplaySettings)(settings);
    castSettingsStore.set("display", next);
    castManager.setSettings(next);
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
    (senderWindow, targetPath: string, options?: DesktopFsWatchOptions) => {
      const watchId = nextFsWatchId++;
      const ownerContentsId = senderWindow.webContents.id;

      const registration: FsWatchRegistration = {
        changedPaths: new Set<string>(),
        debounceTimer: null,
        ownerContentsId,
        watcher: watch(targetPath, {
          ...(options?.recursive === false && { depth: 0 }),
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

  handleIpc("fs:unwatch", (_window, watchId: number) => {
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

  handleIpc("integrated-server:get-diagnostics", () =>
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
        forceSoftwareRendering?: boolean;
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
        options.forceSoftwareRendering === true,
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

  handleIpc("path:app-config-dir", () => {
    return getAppConfigDir(app);
  });

  handleIpc("path:app-local-data-dir", () => {
    return getAppLocalDataDir(app);
  });

  handleIpc("path:download-dir", () => {
    return app.getPath("downloads");
  });

  handleIpc("path:resolve", (_window, ...pathsToResolve: string[]) => {
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

  handleIpc("system:get-info", () => {
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

  handleIpc("window:close", (senderWindow, target?: unknown) => {
    windowTarget(senderWindow, target).close();
  });

  handleIpc("window:is-maximized", (senderWindow, target?: unknown) => {
    return windowTarget(senderWindow, target).isMaximized();
  });

  handleIpc("window:maximize", (senderWindow, target?: unknown) => {
    windowTarget(senderWindow, target).maximize();
  });

  handleIpc("window:minimize", (senderWindow, target?: unknown) => {
    windowTarget(senderWindow, target).minimize();
  });

  handleIpc("window:unmaximize", (senderWindow, target?: unknown) => {
    windowTarget(senderWindow, target).unmaximize();
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

function dialogBaseOptions(
  options: DesktopSaveDialogOptions,
): Pick<SaveDialogOptions, "defaultPath" | "filters" | "title"> {
  return {
    ...(options.defaultPath !== undefined && {
      defaultPath: options.defaultPath,
    }),
    ...(options.filters !== undefined && { filters: options.filters }),
    ...(options.title !== undefined && { title: options.title }),
  };
}

async function openDialog(
  window: BrowserWindow,
  options: DesktopOpenDialogOptions,
): Promise<string | string[] | null> {
  const result = await dialog.showOpenDialog(window, {
    ...dialogBaseOptions(options),
    properties: [
      ...(options.directory
        ? (["openDirectory"] as const)
        : (["openFile"] as const)),
      ...(options.multiple ? (["multiSelections"] as const) : []),
    ],
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
  const result = await dialog.showSaveDialog(
    window,
    dialogBaseOptions(options),
  );

  if (result.canceled) {
    return null;
  }

  return result.filePath;
}

function setThemeSource(theme: DesktopTheme): void {
  const themeSource: StoredThemeSource =
    theme === null ? "system" : theme === "dark" ? "dark" : "light";
  nativeTheme.themeSource = themeSource;
  // Remember the choice so the next launch creates windows with the right
  // background before the renderer loads.
  windowStateStore.set("themeSource", themeSource);
}

function restoreThemeSource(): void {
  const stored = windowStateStore.get("themeSource");
  nativeTheme.themeSource =
    stored === "dark" || stored === "light" ? stored : "system";
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
  restoreThemeSource();
  nativeTheme.on("updated", updateWindowBackgrounds);
  registerSecurityHandlers();
  registerIpcHandlers();
  castManager.setSettings(
    Schema.decodeOption(DisplaySettings)(castSettingsStore.get("display")).pipe(
      Option.getOrElse(() => DEFAULT_SETTINGS),
    ),
  );
  registerAppProtocol();

  let castCleanupComplete = false;
  app.on("before-quit", (event) => {
    if (castCleanupComplete) return;
    event.preventDefault();
    const finish = () => {
      castCleanupComplete = true;
      app.quit();
    };
    void castManager.dispose().then(finish, (error: unknown) => {
      console.error("Could not finish Cast cleanup", error);
      finish();
    });
    void killIntegratedServer(integratedServerState);
  });

  const firstWindow = createMainWindow();
  appStarted = true;
  await firstWindow;
  createAppTray();
  startUpdater(
    () => mainWindow,
    (version) => {
      sendToMainWindow("updates:ready", version);
    },
  );

  app.on("activate", () => {
    focusMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

if (hasSingleInstanceLock) {
  // oxlint-disable-next-line unicorn/prefer-top-level-await -- the main process is bundled as CommonJS, which has no top-level await
  void app.whenReady().then(bootstrap);
}

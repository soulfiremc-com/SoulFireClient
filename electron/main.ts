import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  type IpcMainInvokeEvent,
  Menu,
  nativeImage,
  nativeTheme,
  type NativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  Tray,
  type WebContents,
} from "electron";
import Store from "electron-store";
import { getAppConfigDir, getAppLocalDataDir } from "./native/app-paths";
import {
  executeProviderRequest,
  validateProviderRequest,
} from "../src/lib/provider-request-policy";
import { CastSessionManager } from "./cast/session-manager";
import { DEFAULT_SETTINGS, DisplaySettings } from "@soulfiremc/cast-protocol";
import { Option, Schema } from "effect";
import { DiscordPresenceManager } from "./native/discord";
import {
  createIntegratedServerState,
  killIntegratedServer,
} from "./native/integrated-server-process";
import { PathAccess } from "./native/path-access";
import { resolveAppProtocolPath } from "./app-protocol";
import {
  CastConnectArgs,
  CastSettingsArgs,
  DiscordActivityArgs,
  NoArgs,
  PathResolveArgs,
  PovCaptureArgs,
  StringArg,
  ThemeArgs,
  WindowArgs,
} from "./ipc/args";
import { registerDialogIpc } from "./ipc/dialog";
import { createFsIpc } from "./ipc/fs";
import { createIpcRegistrar } from "./ipc/handle";
import { registerIntegratedServerIpc } from "./ipc/integrated-server";
import { createQuitFlow } from "./quit-flow";
import {
  APP_PROTOCOL,
  APP_PROTOCOL_HOST,
  isAllowedRendererUrl as isRendererUrl,
  isSafeExternalUrl,
} from "./url-policy";
import { trayGuidForPlatform } from "./tray-args";
import {
  getReadyUpdateVersion,
  installUpdateNow,
  startUpdater,
} from "./updater";

const APP_ID = "com.soulfiremc.soulfire";
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

interface StoredWindowState {
  height: number;
  isMaximized: boolean;
  width: number;
  x?: number | undefined;
  y?: number | undefined;
}

type StoredThemeSource = "dark" | "light" | "system";

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

// Packaged builds ignore this variable. Otherwise anyone who can set the
// environment could load a remote page with the desktop API.
const devServerUrl =
  !app.isPackaged && process.env["VITE_DEV_SERVER_URL"]
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
// The renderer may use the profile directory and files the user picked in a
// native dialog. Thread dumps are the only files it may open with the shell.
const pathAccess = new PathAccess(() => [getAppConfigDir(app)]);
const openableFiles = new Set<string>();
const fsIpc = createFsIpc(pathAccess, sendToMainWindow);
// Keeps a reference so the tray icon is not garbage collected.
let tray: Tray | null = null;
let appStarted = false;
const quitFlow = createQuitFlow({
  getWindow: () => mainWindow,
  // Wait for Java too, so a server that ignores the stop request is still
  // forced to stop before the app exits.
  cleanup: async () => {
    const [cast, server] = await Promise.allSettled([
      castManager.dispose(),
      killIntegratedServer(integratedServerState),
    ]);
    if (cast.status === "rejected")
      console.error("Could not finish Cast cleanup", cast.reason);
    if (server.status === "rejected")
      console.error("Could not stop the integrated server", server.reason);
  },
  quit: () => {
    app.quit();
  },
});

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    focusMainWindow();
  });
} else {
  app.quit();
}

function preloadPath(): string {
  return path.join(app.getAppPath(), "dist-electron", "preload.mjs");
}

function rendererEntryUrl(): string {
  return devServerUrl?.toString() ?? `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}/`;
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
  return resolveAssetPath(
    process.platform === "win32"
      ? "build/icons/icon.ico"
      : "build/icons/icon.png",
  );
}

function trayIconPath(): string {
  return process.platform === "darwin"
    ? resolveAssetPath("build/icons/trayTemplate.png")
    : appIconPath();
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

// Installers start as soon as electron-updater is told to install. Close the
// window and stop Java first, so a "Stay" answer to the unsaved changes prompt
// cancels the update restart too.
function restartToUpdate(): void {
  quitFlow.quitWith(() => {
    if (!installUpdateNow()) app.quit();
  });
}

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    // The app is stopping Java before it exits. A new window would close
    // again when cleanup finishes.
    if (quitFlow.isQuitting()) return;
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

function isAllowedRendererUrl(target: string): boolean {
  return isRendererUrl(target, devServerUrl);
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

function registerAppProtocol(): void {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = await resolveAppProtocolPath(
      request.url,
      path.join(app.getAppPath(), "dist"),
    );
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

// Permissions the app uses: clipboard import and copy, POV pointer, keyboard
// and fullscreen capture, and connections to local and LAN SoulFire servers.
const ALLOWED_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
  "keyboardLock",
  "local-network",
  "local-network-access",
  "loopback-network",
  "pointerLock",
]);

function isTrustedContents(contents: WebContents | null): boolean {
  if (contents === null || mainWindow === null || mainWindow.isDestroyed()) {
    return false;
  }
  if (contents === mainWindow.webContents) {
    return isAllowedRendererUrl(contents.getURL());
  }
  // POV popups load about:blank and are scripted by the main window.
  return [...povWindows.values()].some(
    (window) => !window.isDestroyed() && window.webContents === contents,
  );
}

function registerPermissionHandlers(): void {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) => {
      callback(
        ALLOWED_PERMISSIONS.has(permission) && isTrustedContents(contents),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission) =>
      ALLOWED_PERMISSIONS.has(permission) && isTrustedContents(contents),
  );
}

function registerSecurityHandlers(): void {
  registerPermissionHandlers();
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
          // A reload drops the page's watch subscriptions with it.
          fsIpc.cleanupForContents(contents.id);
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
      fsIpc.cleanupForContents(contents.id);
    });
  });
}

function showEditContextMenu(
  contents: Electron.WebContents,
  params: Electron.ContextMenuParams,
): void {
  const { editFlags, isEditable, linkURL, selectionText } = params;
  // In-app links use the app protocol and are not offered here.
  const linkItems: Electron.MenuItemConstructorOptions[] =
    linkURL !== "" && isSafeExternalUrl(linkURL)
      ? [
          {
            label: "Open link",
            click: () => {
              void shell.openExternal(linkURL);
            },
          },
          {
            label: "Copy link address",
            click: () => {
              clipboard.writeText(linkURL).catch((error: unknown) => {
                console.error("Could not copy the link", error);
              });
            },
          },
        ]
      : [];
  const editItems: Electron.MenuItemConstructorOptions[] = isEditable
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
  const template = [
    ...linkItems,
    ...(linkItems.length > 0 && editItems.length > 0
      ? [{ type: "separator" } as const]
      : []),
    ...editItems,
  ];
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
  // The script editor blocks unloading while it has unsaved changes. Ask here,
  // because Electron otherwise refuses the close without telling the user.
  window.webContents.on("will-prevent-unload", (event) => {
    // A tray quit can arrive while the window is hidden or minimized. Show it,
    // so the modal prompt is visible.
    if (window.isMinimized()) window.restore();
    window.show();
    const response = dialog.showMessageBoxSync(window, {
      buttons: ["Leave", "Stay"],
      cancelId: 1,
      defaultId: 1,
      detail: "Your changes are not saved. If you leave now, they are lost.",
      message: "Leave without saving?",
      title: "Unsaved changes",
      type: "warning",
    });
    if (response === 0) {
      event.preventDefault();
    } else {
      quitFlow.closeCancelled();
    }
  });
  // Stop the server only after the close is confirmed. The "close" event
  // fires before the renderer can cancel it.
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
    killIntegratedServer(integratedServerState).catch((error: unknown) => {
      console.error("Could not stop the integrated server", error);
    });
    quitFlow.windowClosed();
  });

  // Moving or resizing fires many events. Write the state once the window
  // settles, and on close so the last change is not lost.
  let saveTimer: NodeJS.Timeout | undefined;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistWindowState(window);
    }, 500);
  };
  window.on("close", () => {
    clearTimeout(saveTimer);
    persistWindowState(window);
  });
  window.on("resize", () => {
    sendToMainWindow("window:resized");
    scheduleSave();
  });
  window.on("move", scheduleSave);
  window.on("maximize", scheduleSave);
  window.on("unmaximize", scheduleSave);

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

// The target comes from the renderer and is decoded before this runs.
function windowTarget(
  sender: BrowserWindow,
  target: "pov" | undefined,
): BrowserWindow {
  if (target === undefined) return sender;
  const popup = povWindows.get(sender.webContents.id);
  if (!popup || popup.isDestroyed()) throw new Error("POV window is closed");
  return popup;
}

function registerIpcHandlers(): void {
  const handleIpc = createIpcRegistrar(validateIpcSender);

  handleIpc(
    "providers:request",
    Schema.Tuple([Schema.Unknown]),
    async (_window, request) => {
      validateProviderRequest(request);
      return executeProviderRequest(request, (input, init) =>
        net.fetch(input, init),
      );
    },
  );

  handleIpc("pov:set-captured", PovCaptureArgs, (owner, captured, target) => {
    if (captured) {
      const window = windowTarget(owner, target);
      povInputOwners.set(window.webContents.id, { owner, target });
    } else {
      for (const [id, capture] of povInputOwners) {
        if (capture.owner === owner && capture.target === target)
          povInputOwners.delete(id);
      }
    }
    // Native shortcut registration is optional. Some compositors cannot reserve
    // bare Escape; pointer capture must still work with Chromium's fallback.
    updatePovEscapeShortcut();
  });

  handleIpc("app:quit", NoArgs, () => {
    app.quit();
  });
  handleIpc("app:set-theme", ThemeArgs, (_window, theme) => {
    const themeSource = theme ?? "system";
    nativeTheme.themeSource = themeSource;
    // Remember the choice so the next launch creates windows with the right
    // background before the renderer loads.
    windowStateStore.set("themeSource", themeSource);
  });

  handleIpc("updates:get-ready", NoArgs, () => getReadyUpdateVersion());
  handleIpc("updates:install-now", NoArgs, () => {
    restartToUpdate();
  });

  handleIpc("cast:connect", CastConnectArgs, async (_window, options) =>
    castManager.connect(
      options.device,
      options.source,
      options.relaunch === true,
    ),
  );
  handleIpc("cast:discover", NoArgs, () => {
    castManager.discover();
  });
  handleIpc("cast:get-state", NoArgs, () => castManager.getState());
  handleIpc("cast:stop", StringArg, async (_window, id) => {
    await castManager.stop(id);
  });
  handleIpc("cast:stop-all", NoArgs, async () => {
    await castManager.stopAll();
  });
  handleIpc("cast:settings", CastSettingsArgs, (_window, settings) => {
    castSettingsStore.set("display", settings);
    castManager.setSettings(settings);
  });

  handleIpc(
    "discord:update-activity",
    DiscordActivityArgs,
    async (_window, state, details) => discordPresence.update(state, details),
  );

  registerDialogIpc(handleIpc, pathAccess);
  fsIpc.register(handleIpc);
  registerIntegratedServerIpc(handleIpc, {
    app,
    state: integratedServerState,
    pathAccess,
    allowOpenFile: (filePath) => {
      openableFiles.add(path.resolve(filePath));
    },
  });

  handleIpc("path:app-config-dir", NoArgs, () => getAppConfigDir(app));
  handleIpc("path:app-local-data-dir", NoArgs, () => getAppLocalDataDir(app));
  handleIpc("path:download-dir", NoArgs, () => app.getPath("downloads"));
  handleIpc("path:resolve", PathResolveArgs, (_window, ...pathsToResolve) =>
    path.resolve(...pathsToResolve),
  );

  handleIpc("shell:open-external", StringArg, async (_window, target) => {
    if (!isSafeExternalUrl(target)) {
      throw new Error(`Blocked external URL: ${target}`);
    }
    await shell.openExternal(target);
  });
  handleIpc("shell:open-path", StringArg, async (_window, target) => {
    const resolved = path.resolve(target);
    const openableDirectories = [getAppConfigDir(app), getAppLocalDataDir(app)];
    if (
      !openableFiles.has(resolved) &&
      !openableDirectories.some(
        (directory) => path.resolve(directory) === resolved,
      )
    ) {
      throw new Error(`Blocked opening path: ${resolved}`);
    }
    return shell.openPath(resolved);
  });

  handleIpc("system:get-info", NoArgs, () => ({
    appVersion: app.getVersion(),
    os: {
      arch: process.arch,
      locale: app.getLocale(),
      platform: process.platform,
      type: mapPlatformToType(process.platform),
      version: os.release(),
    },
  }));

  handleIpc("window:close", WindowArgs, (sender, target) => {
    windowTarget(sender, target).close();
  });
  handleIpc("window:is-maximized", WindowArgs, (sender, target) =>
    windowTarget(sender, target).isMaximized(),
  );
  handleIpc("window:maximize", WindowArgs, (sender, target) => {
    windowTarget(sender, target).maximize();
  });
  handleIpc("window:minimize", WindowArgs, (sender, target) => {
    windowTarget(sender, target).minimize();
  });
  handleIpc("window:unmaximize", WindowArgs, (sender, target) => {
    windowTarget(sender, target).unmaximize();
  });
}

function restoreThemeSource(): void {
  const stored = windowStateStore.get("themeSource");
  nativeTheme.themeSource =
    stored === "dark" || stored === "light" ? stored : "system";
}

function mapPlatformToType(platformName: string): string {
  switch (platformName) {
    case "darwin": {
      return "macos";
    }
    case "win32": {
      return "windows";
    }
    case "linux": {
      return "linux";
    }
    default: {
      return platformName;
    }
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

  // Tray, menu, renderer, and updater quits all close the window first, so
  // unsaved script changes get the same prompt as closing the window.
  app.on("before-quit", (event) => {
    if (quitFlow.beforeQuit()) event.preventDefault();
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
    restartToUpdate,
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

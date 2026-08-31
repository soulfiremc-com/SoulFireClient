import { clipboard, contextBridge, ipcRenderer } from "electron";
import type { SoulFireDesktopApi } from "../src/lib/desktop-api";

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function subscribe<T>(
  channel: string,
  callback: (payload: T) => void,
): Promise<() => void> {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => {
    callback(payload);
  };

  ipcRenderer.on(channel, listener);

  return Promise.resolve(() => {
    ipcRenderer.removeListener(channel, listener);
  });
}

const desktopApi: SoulFireDesktopApi = {
  app: {
    onOpenUrl: async (callback) => subscribe("app:open-url", callback),
    quit: async () => {
      await invoke("app:quit");
    },
    setTheme: async (theme) => {
      await invoke("app:set-theme", theme);
    },
  },
  cast: {
    broadcast: async (payload) => {
      await invoke("cast:broadcast", payload);
    },
    connect: async (address, port) => {
      return invoke("cast:connect", {
        address,
        port,
      });
    },
    discover: async () => {
      await invoke("cast:discover");
    },
    getDevices: async () => invoke("cast:get-devices"),
    onDisconnected: async (callback) =>
      subscribe("cast:device-disconnected", callback),
    onDiscovered: async (callback) =>
      subscribe("cast:device-discovered", callback),
    onRemoved: async (callback) => subscribe("cast:device-removed", callback),
  },
  clipboard: {
    readText: async () => clipboard.readText(),
    writeText: async (text: string) => {
      clipboard.writeText(text);
    },
  },
  dialog: {
    open: async (options) => invoke("dialog:open", options),
    save: async (options) => invoke("dialog:save", options),
  },
  discord: {
    updateActivity: async (state: string, details?: string | null) => {
      await invoke("discord:update-activity", state, details);
    },
  },
  fs: {
    mkdir: async (targetPath, options) =>
      invoke("fs:mkdir", targetPath, options),
    readDir: async (targetPath) => invoke("fs:read-dir", targetPath),
    readTextFile: async (targetPath) => invoke("fs:read-text-file", targetPath),
    watch: async (watchPath, callback, options) => {
      const watchId = await invoke<number>("fs:watch", watchPath, options);
      const unlisten = await subscribe(`fs:watch:${watchId}`, callback);

      return () => {
        unlisten();
        void invoke("fs:unwatch", watchId);
      };
    },
    writeTextFile: async (targetPath, contents) =>
      invoke("fs:write-text-file", targetPath, contents),
  },
  integratedServer: {
    getDiagnostics: async () => invoke("integrated-server:get-diagnostics"),
    openDataDirectory: async () =>
      invoke("integrated-server:open-data-directory"),
    selectJcmd: async () => invoke("integrated-server:select-jcmd"),
    captureThreadDump: async () =>
      invoke("integrated-server:capture-thread-dump"),
    getVersion: async () => invoke("integrated-server:get-version"),
    importCustomJar: async (sourcePath) =>
      invoke("integrated-server:import-custom-jar", sourcePath),
    kill: async () => {
      await invoke("integrated-server:kill");
    },
    listCustomJars: async () => invoke("integrated-server:list-custom-jars"),
    removeCustomJar: async (jarId) =>
      invoke("integrated-server:remove-custom-jar", jarId),
    resetData: async () => {
      await invoke("integrated-server:reset-data");
    },
    run: async (options) => invoke("integrated-server:run", options),
  },
  path: {
    appConfigDir: async () => invoke("path:app-config-dir"),
    appLocalDataDir: async () => invoke("path:app-local-data-dir"),
    downloadDir: async () => invoke("path:download-dir"),
    resolve: async (...paths: string[]) => invoke("path:resolve", ...paths),
  },
  shell: {
    openExternal: async (target) => {
      await invoke("shell:open-external", target);
    },
    openPath: async (target) => invoke("shell:open-path", target),
  },
  system: {
    getInfo: async () => invoke("system:get-info"),
  },
  window: {
    close: async () => {
      await invoke("window:close");
    },
    isMaximized: async () => invoke("window:is-maximized"),
    maximize: async () => {
      await invoke("window:maximize");
    },
    minimize: async () => {
      await invoke("window:minimize");
    },
    onResized: async (callback) => subscribe("window:resized", callback),
    unmaximize: async () => {
      await invoke("window:unmaximize");
    },
  },
};

contextBridge.exposeInMainWorld("soulfireElectron", desktopApi);

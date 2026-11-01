import type {
  CastDevice,
  CastSource,
  CastState,
  DisplaySettings,
} from "@soulfiremc/cast-protocol";
import type {
  ProviderRequest,
  ProviderResponse,
} from "./provider-request-policy";

export type DesktopTheme = "dark" | "light" | null;

export type DesktopFsEntry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
};

export type DesktopFsWatchEvent = {
  paths: string[];
};

export type DesktopFsWatchOptions = {
  delayMs?: number;
  recursive?: boolean;
};

export type DesktopMkdirOptions = {
  recursive?: boolean;
};

export type DesktopFileFilter = {
  name: string;
  extensions: string[];
};

export type DesktopOpenDialogOptions = {
  title?: string;
  filters?: DesktopFileFilter[];
  defaultPath?: string;
  multiple?: boolean;
  directory?: boolean;
};

export type DesktopSaveDialogOptions = {
  title?: string;
  filters?: DesktopFileFilter[];
  defaultPath?: string;
};

export type DesktopUnlisten = () => void;

export type DesktopSystemInfo = {
  appVersion: string;
  os: {
    arch: string;
    locale: string;
    platform: string;
    type: string;
    version: string;
  };
};

export type DesktopIntegratedServerCredentials = {
  address: string;
  token: string;
};

export type DesktopIntegratedServerLog = {
  id: number;
  timestamp: number;
  source: "launcher" | "stdout" | "stderr";
  message: string;
};

export type DesktopIntegratedServerDiagnostics = {
  status:
    | "idle"
    | "preparing"
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "failed";
  pid: number | null;
  startedAt: number | null;
  processStartedAt: number | null;
  exitedAt: number | null;
  exitCode: number | null;
  exitSignal: string | null;
  error: string | null;
  javaPath: string | null;
  jarPath: string | null;
  dataDirectory: string;
  port: number | null;
  jcmdPath: string | null;
  logs: DesktopIntegratedServerLog[];
  droppedLogCount: number;
};

export type DesktopIntegratedServerJarSource =
  | {
      type: "official";
    }
  | {
      jarId: string;
      type: "custom";
    };

export type DesktopCustomSoulFireServerJar = {
  id: string;
  importedAt: string;
  originalName: string;
  path: string;
  sha256: string;
  size: number;
};

export type DesktopPovEscape = {
  target?: "pov";
  action: number;
  modifiers: number;
};

export interface SoulFireDesktopApi {
  providers: {
    request: (request: ProviderRequest) => Promise<ProviderResponse>;
  };
  pov: {
    onReleased: (
      callback: (target?: "pov") => void,
    ) => Promise<DesktopUnlisten>;
    setCaptured: (captured: boolean, target?: "pov") => Promise<void>;
    onEscape: (
      callback: (event: DesktopPovEscape) => void,
    ) => Promise<DesktopUnlisten>;
  };
  app: {
    onOpenUrl: (callback: (url: string) => void) => Promise<DesktopUnlisten>;
    quit: () => Promise<void>;
    setTheme: (theme: DesktopTheme) => Promise<void>;
  };
  cast: {
    connect: (
      device: CastDevice,
      source: CastSource,
      relaunch?: boolean,
    ) => Promise<void>;
    discover: () => Promise<void>;
    getState: () => Promise<CastState>;
    stop: (id: string) => Promise<void>;
    stopAll: () => Promise<void>;
    setSettings: (settings: DisplaySettings) => Promise<void>;
    onState: (callback: (state: CastState) => void) => Promise<DesktopUnlisten>;
  };
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
  dialog: {
    open: (
      options: DesktopOpenDialogOptions,
    ) => Promise<string | string[] | null>;
    save: (options: DesktopSaveDialogOptions) => Promise<string | null>;
  };
  discord: {
    updateActivity: (state: string, details?: string | null) => Promise<void>;
  };
  fs: {
    mkdir: (path: string, options?: DesktopMkdirOptions) => Promise<void>;
    readDir: (path: string) => Promise<DesktopFsEntry[]>;
    readTextFile: (path: string) => Promise<string>;
    watch: (
      path: string,
      callback: (event: DesktopFsWatchEvent) => void,
      options?: DesktopFsWatchOptions,
    ) => Promise<DesktopUnlisten>;
    writeTextFile: (path: string, contents: string) => Promise<void>;
  };
  integratedServer: {
    getDiagnostics: () => Promise<DesktopIntegratedServerDiagnostics>;
    openDataDirectory: () => Promise<void>;
    selectJcmd: () => Promise<string | null>;
    captureThreadDump: () => Promise<string>;
    getVersion: () => Promise<string>;
    importCustomJar: (
      sourcePath: string,
    ) => Promise<DesktopCustomSoulFireServerJar>;
    kill: () => Promise<void>;
    listCustomJars: () => Promise<DesktopCustomSoulFireServerJar[]>;
    removeCustomJar: (jarId: string) => Promise<void>;
    resetData: () => Promise<void>;
    run: (options: {
      forceSoftwareRendering?: boolean;
      jarSource?: DesktopIntegratedServerJarSource;
      jvmArgs: string[];
    }) => Promise<DesktopIntegratedServerCredentials | null>;
  };
  path: {
    appConfigDir: () => Promise<string>;
    appLocalDataDir: () => Promise<string>;
    downloadDir: () => Promise<string>;
    resolve: (...paths: string[]) => Promise<string>;
  };
  shell: {
    openExternal: (target: string) => Promise<void>;
    openPath: (target: string) => Promise<string>;
  };
  system: {
    getInfo: () => Promise<DesktopSystemInfo>;
  };
  window: {
    close: (target?: "pov") => Promise<void>;
    isMaximized: (target?: "pov") => Promise<boolean>;
    maximize: (target?: "pov") => Promise<void>;
    minimize: (target?: "pov") => Promise<void>;
    onResized: (
      callback: () => void,
      target?: "pov",
    ) => Promise<DesktopUnlisten>;
    unmaximize: (target?: "pov") => Promise<void>;
  };
}

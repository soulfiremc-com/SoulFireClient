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

export interface DesktopFsEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface DesktopFsWatchEvent {
  paths: string[];
}

export interface DesktopFsWatchOptions {
  delayMs?: number;
  recursive?: boolean;
}

export interface DesktopMkdirOptions {
  recursive?: boolean;
}

export interface DesktopFileFilter {
  name: string;
  extensions: string[];
}

export interface DesktopOpenDialogOptions {
  title?: string | undefined;
  filters?: DesktopFileFilter[] | undefined;
  defaultPath?: string | undefined;
  multiple?: boolean | undefined;
  directory?: boolean | undefined;
}

export interface DesktopSaveDialogOptions {
  title?: string | undefined;
  filters?: DesktopFileFilter[] | undefined;
  defaultPath?: string | undefined;
}

export type DesktopUnlisten = () => void;

export interface DesktopSystemInfo {
  appVersion: string;
  os: {
    arch: string;
    locale: string;
    platform: string;
    type: string;
    version: string;
  };
}

export interface DesktopIntegratedServerCredentials {
  address: string;
  token: string;
}

export interface DesktopIntegratedServerLog {
  id: number;
  timestamp: number;
  source: "launcher" | "stdout" | "stderr";
  message: string;
}

/**
 * A diagnostics poll. With `logsAfter` set, `logs` holds only entries newer
 * than that ID, and older entries below `firstLogId` were dropped.
 */
export interface DesktopIntegratedServerDiagnosticsUpdate extends DesktopIntegratedServerDiagnostics {
  logsAfter: number | null;
  firstLogId: number | null;
}

export interface DesktopIntegratedServerDiagnostics {
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
}

export type DesktopIntegratedServerJarSource =
  | {
      type: "official";
    }
  | {
      jarId: string;
      type: "custom";
    };

export interface DesktopCustomSoulFireServerJar {
  id: string;
  importedAt: string;
  originalName: string;
  path: string;
  sha256: string;
  size: number;
}

export interface DesktopPovEscape {
  target?: "pov";
  action: number;
  modifiers: number;
}

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
    quit: () => Promise<void>;
    setTheme: (theme: DesktopTheme) => Promise<void>;
  };
  updates: {
    /** The version of a downloaded update waiting for a restart, if any. */
    getReady: () => Promise<string | null>;
    onReady: (callback: (version: string) => void) => Promise<DesktopUnlisten>;
    installNow: () => Promise<void>;
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
    getDiagnostics: (
      afterLogId?: number,
    ) => Promise<DesktopIntegratedServerDiagnosticsUpdate>;
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

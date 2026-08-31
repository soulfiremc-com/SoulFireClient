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

export type DesktopCastDevice = {
  address: string;
  full_name: string;
  id: string;
  name: string;
  port: number;
};

export type DesktopCastDisconnectedEvent = {
  transport_id: string;
};

export type DesktopCastRemovedEvent = {
  full_name: string;
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

export interface SoulFireDesktopApi {
  app: {
    onOpenUrl: (callback: (url: string) => void) => Promise<DesktopUnlisten>;
    quit: () => Promise<void>;
    setTheme: (theme: DesktopTheme) => Promise<void>;
  };
  cast: {
    broadcast: (payload?: unknown) => Promise<void>;
    connect: (address: string, port: number) => Promise<string>;
    discover: () => Promise<void>;
    getDevices: () => Promise<DesktopCastDevice[]>;
    onDisconnected: (
      callback: (payload: DesktopCastDisconnectedEvent) => void,
    ) => Promise<DesktopUnlisten>;
    onDiscovered: (
      callback: (device: DesktopCastDevice) => void,
    ) => Promise<DesktopUnlisten>;
    onRemoved: (
      callback: (payload: DesktopCastRemovedEvent) => void,
    ) => Promise<DesktopUnlisten>;
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
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    maximize: () => Promise<void>;
    minimize: () => Promise<void>;
    onResized: (callback: () => void) => Promise<DesktopUnlisten>;
    unmaximize: () => Promise<void>;
  };
}

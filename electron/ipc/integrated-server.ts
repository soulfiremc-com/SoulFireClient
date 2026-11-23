import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type App, dialog, shell } from "electron";
import {
  getSoulFireServerVersion,
  importCustomSoulFireServerJar,
  listCustomSoulFireServerJars,
  removeCustomSoulFireServerJar,
  resetIntegratedData,
  runIntegratedServer,
} from "../native/integrated-server";
import {
  captureIntegratedThreadDump,
  getIntegratedDiagnostics,
  integratedDataDirectory,
  validateJcmd,
} from "../native/integrated-server-diagnostics";
import {
  type IntegratedServerState,
  killIntegratedServer,
} from "../native/integrated-server-process";
import type { PathAccess } from "../native/path-access";
import {
  DiagnosticsArgs,
  NoArgs,
  RunIntegratedServerArgs,
  StringArg,
} from "./args";
import type { HandleIpc } from "./handle";

export function registerIntegratedServerIpc(
  handleIpc: HandleIpc,
  {
    app,
    state,
    pathAccess,
    allowOpenFile,
  }: {
    app: App;
    state: IntegratedServerState;
    pathAccess: PathAccess;
    /** Lets the renderer open this file with the shell later. */
    allowOpenFile: (filePath: string) => void;
  },
): void {
  handleIpc("integrated-server:get-version", NoArgs, async () =>
    getSoulFireServerVersion(app, app.getVersion()),
  );

  handleIpc(
    "integrated-server:get-diagnostics",
    DiagnosticsArgs,
    (_window, afterLogId) => getIntegratedDiagnostics(app, state, afterLogId),
  );

  handleIpc("integrated-server:open-data-directory", NoArgs, async () => {
    const directory = integratedDataDirectory(app, state);
    await mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });

  handleIpc("integrated-server:select-jcmd", NoArgs, async (window) => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose jcmd from JDK 25",
      properties: ["openFile"],
    });
    const executable = result.filePaths[0];
    if (result.canceled || !executable) return null;
    await validateJcmd(executable);
    state.jcmdPath = executable;
    return executable;
  });

  handleIpc("integrated-server:capture-thread-dump", NoArgs, async () => {
    const dumpPath = await captureIntegratedThreadDump(app, state);
    allowOpenFile(dumpPath);
    return dumpPath;
  });

  handleIpc("integrated-server:list-custom-jars", NoArgs, async () =>
    listCustomSoulFireServerJars(app),
  );

  handleIpc(
    "integrated-server:import-custom-jar",
    StringArg,
    async (_window, sourcePath) => {
      if (
        !pathAccess.isGrantedFile(sourcePath) ||
        path.extname(sourcePath).toLowerCase() !== ".jar"
      ) {
        throw new Error("Choose the server jar in the file dialog first");
      }
      return importCustomSoulFireServerJar(app, sourcePath);
    },
  );

  handleIpc(
    "integrated-server:remove-custom-jar",
    StringArg,
    async (_window, jarId) => {
      await removeCustomSoulFireServerJar(app, jarId);
    },
  );

  handleIpc("integrated-server:kill", NoArgs, async () => {
    await killIntegratedServer(state);
  });

  handleIpc("integrated-server:reset-data", NoArgs, async () => {
    await killIntegratedServer(state);
    await resetIntegratedData(app);
  });

  handleIpc(
    "integrated-server:run",
    RunIntegratedServerArgs,
    async (_window, options) => {
      const credentials = await runIntegratedServer(
        app,
        state,
        [...options.jvmArgs],
        options.jarSource ?? { type: "official" },
        app.getVersion(),
        options.forceSoftwareRendering === true,
      );
      if (credentials === null) return null;
      const [address, token] = credentials.split("\n");
      return { address, token };
    },
  );
}

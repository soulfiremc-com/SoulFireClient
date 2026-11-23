import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import type { PathAccess } from "../native/path-access";
import {
  FsUnwatchArgs,
  FsWatchArgs,
  MkdirArgs,
  StringArg,
  WriteTextFileArgs,
} from "./args";
import type { HandleIpc } from "./handle";

interface FsWatchRegistration {
  changedPaths: Set<string>;
  debounceTimer: NodeJS.Timeout | null;
  ownerContentsId: number;
  watcher: ReturnType<typeof watch>;
}

/**
 * File access for the renderer. Every path goes through `pathAccess`, so the
 * renderer reaches only the profile directory and files the user picked.
 */
export function createFsIpc(
  pathAccess: PathAccess,
  send: (channel: string, payload: unknown) => void,
) {
  const watchers = new Map<number, FsWatchRegistration>();
  let nextWatchId = 1;

  const cleanupWatch = (watchId: number) => {
    const registration = watchers.get(watchId);
    if (registration === undefined) return;
    watchers.delete(watchId);
    if (registration.debounceTimer !== null)
      clearTimeout(registration.debounceTimer);
    registration.watcher.close().catch((error: unknown) => {
      console.error(`Could not close file watch ${watchId}`, error);
    });
  };

  const register = (handleIpc: HandleIpc) => {
    handleIpc("fs:mkdir", MkdirArgs, async (_window, targetPath, options) => {
      await mkdir(pathAccess.resolve(targetPath), {
        recursive: options?.recursive === true,
      });
    });

    handleIpc("fs:read-dir", StringArg, async (_window, targetPath) => {
      const entries = await readdir(pathAccess.resolve(targetPath), {
        withFileTypes: true,
      });
      return entries.map((entry) => ({
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink(),
        name: entry.name,
      }));
    });

    handleIpc("fs:read-text-file", StringArg, async (_window, targetPath) =>
      readFile(pathAccess.resolve(targetPath), "utf8"),
    );

    handleIpc(
      "fs:write-text-file",
      WriteTextFileArgs,
      async (_window, targetPath, contents) => {
        const resolvedPath = pathAccess.resolve(targetPath);
        await mkdir(path.dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, contents, "utf8");
      },
    );

    handleIpc("fs:watch", FsWatchArgs, (senderWindow, targetPath, options) => {
      const watchId = nextWatchId++;
      const registration: FsWatchRegistration = {
        changedPaths: new Set<string>(),
        debounceTimer: null,
        ownerContentsId: senderWindow.webContents.id,
        watcher: watch(pathAccess.resolve(targetPath), {
          ...(options?.recursive === false && { depth: 0 }),
          ignoreInitial: true,
          persistent: true,
        }),
      };
      const delayMs = options?.delayMs ?? 0;

      const flush = () => {
        registration.debounceTimer = null;
        if (registration.changedPaths.size === 0) return;
        send(`fs:watch:${watchId}`, {
          paths: [...registration.changedPaths],
        });
        registration.changedPaths.clear();
      };

      const queuePath = (changedPath: string) => {
        registration.changedPaths.add(changedPath);
        if (delayMs === 0) {
          flush();
          return;
        }
        if (registration.debounceTimer !== null)
          clearTimeout(registration.debounceTimer);
        registration.debounceTimer = setTimeout(flush, delayMs);
      };

      for (const eventName of [
        "add",
        "addDir",
        "change",
        "unlink",
        "unlinkDir",
      ] as const) {
        registration.watcher.on(eventName, queuePath);
      }
      // Without a listener, chokidar's "error" event (EACCES, or the inotify
      // watch limit) would throw in the main process.
      registration.watcher.on("error", (error) => {
        console.error(`File watch ${watchId} failed`, error);
        cleanupWatch(watchId);
      });

      watchers.set(watchId, registration);
      return watchId;
    });

    handleIpc("fs:unwatch", FsUnwatchArgs, (_window, watchId) => {
      cleanupWatch(watchId);
    });
  };

  return {
    register,
    /** Stops the watches of a page that reloaded or closed. */
    cleanupForContents: (contentsId: number) => {
      for (const [watchId, registration] of watchers) {
        if (registration.ownerContentsId === contentsId) cleanupWatch(watchId);
      }
    },
  };
}

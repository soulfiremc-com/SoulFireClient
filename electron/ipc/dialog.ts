import { access } from "node:fs/promises";
import path from "node:path";
import { dialog, type SaveDialogOptions } from "electron";
import { type PathAccess, withFilterExtension } from "../native/path-access";
import { OpenDialogArgs, SaveDialogArgs } from "./args";
import type { HandleIpc } from "./handle";

type SaveOptions = (typeof SaveDialogArgs.Type)[0];

function baseOptions(
  options: SaveOptions,
): Pick<SaveDialogOptions, "defaultPath" | "filters" | "title"> {
  return {
    ...(options.defaultPath !== undefined && {
      defaultPath: options.defaultPath,
    }),
    ...(options.filters !== undefined && {
      filters: options.filters.map(({ name, extensions }) => ({
        name,
        extensions: [...extensions],
      })),
    }),
    ...(options.title !== undefined && { title: options.title }),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Native open and save dialogs. Picked paths become usable by the renderer. */
export function registerDialogIpc(
  handleIpc: HandleIpc,
  pathAccess: PathAccess,
): void {
  handleIpc("dialog:open", OpenDialogArgs, async (window, options) => {
    const result = await dialog.showOpenDialog(window, {
      ...baseOptions(options),
      properties: [
        options.directory === true ? "openDirectory" : "openFile",
        ...(options.multiple === true ? (["multiSelections"] as const) : []),
      ],
    });
    if (result.canceled) return null;

    for (const filePath of result.filePaths) {
      if (options.directory === true) pathAccess.grantDirectory(filePath);
      else pathAccess.grantFile(filePath);
    }
    return options.multiple === true
      ? result.filePaths
      : (result.filePaths[0] ?? null);
  });

  handleIpc("dialog:save", SaveDialogArgs, async (window, options) => {
    const result = await dialog.showSaveDialog(window, baseOptions(options));
    if (result.canceled || !result.filePath) return null;

    const filePath = withFilterExtension(result.filePath, options.filters);
    // The dialog checked only the name the user typed. Ask before replacing
    // the file that the added extension points to.
    if (filePath !== result.filePath && (await fileExists(filePath))) {
      const { response } = await dialog.showMessageBox(window, {
        buttons: ["Replace", "Cancel"],
        cancelId: 1,
        defaultId: 1,
        detail: "Replacing it overwrites its contents.",
        message: `"${path.basename(filePath)}" already exists. Replace it?`,
        title: "Replace file",
        type: "warning",
      });
      if (response !== 0) return null;
    }
    pathAccess.grantFile(filePath);
    return filePath;
  });
}

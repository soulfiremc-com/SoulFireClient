import path from "node:path";

export function isPathWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/**
 * Tracks which paths the renderer may use. It may use paths under the app's
 * own directories and paths that the user picked in a native dialog.
 */
export class PathAccess {
  private readonly grantedFiles = new Set<string>();
  private readonly grantedDirectories = new Set<string>();
  private readonly roots: () => readonly string[];

  constructor(roots: () => readonly string[]) {
    this.roots = roots;
  }

  grantFile(filePath: string): void {
    this.grantedFiles.add(path.resolve(filePath));
  }

  grantDirectory(directoryPath: string): void {
    this.grantedDirectories.add(path.resolve(directoryPath));
  }

  isGrantedFile(filePath: unknown): filePath is string {
    return (
      typeof filePath === "string" &&
      this.grantedFiles.has(path.resolve(filePath))
    );
  }

  /** Returns the resolved path, or throws when the renderer may not use it. */
  resolve(target: unknown): string {
    if (typeof target !== "string" || target === "") {
      throw new Error("Invalid path");
    }
    const resolved = path.resolve(target);
    if (
      this.grantedFiles.has(resolved) ||
      [...this.roots(), ...this.grantedDirectories].some((root) =>
        isPathWithin(root, resolved),
      )
    ) {
      return resolved;
    }
    throw new Error(`Blocked access to path: ${resolved}`);
  }
}

/**
 * Some Linux save dialogs return the name without the filter's extension. Adds
 * the first filter extension then, so the granted path is the one the renderer
 * writes to. The check ignores case, so `Profile.JSON` stays as it is.
 */
export function withFilterExtension(
  filePath: string,
  filters: readonly { extensions: readonly string[] }[] = [],
): string {
  const extensions = filters
    .flatMap((filter) => filter.extensions)
    .filter((extension) => extension !== "*");
  const lowerPath = filePath.toLowerCase();
  if (
    extensions.length === 0 ||
    extensions.some((extension) =>
      lowerPath.endsWith(`.${extension.toLowerCase()}`),
    )
  ) {
    return filePath;
  }
  return `${filePath}.${extensions[0]}`;
}

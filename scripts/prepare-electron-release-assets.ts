import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Schema } from "effect";
import { parse, stringify } from "yaml";

const releaseArtifactsDir = path.resolve(
  process.argv[2] ?? "release-artifacts",
);
const releaseUploadDir = path.resolve(process.argv[3] ?? "release-upload");
const githubReleaseDownloadBaseUrl =
  "https://github.com/soulfiremc-com/SoulFireClient/releases/download";

const electronUpdaterMetadataNames = new Set([
  "builder-debug.yml",
  "latest.yml",
  "latest-mac.yml",
  "latest-linux.yml",
  "latest-linux-arm64.yml",
]);
const assetNames = new Set<string>();

// Keep every other field so the rewritten metadata matches electron-builder's.
const UnknownFields = Schema.Record(Schema.String, Schema.Unknown);
const UpdateInfoSchema = Schema.StructWithRest(
  Schema.Struct({ files: Schema.Array(Schema.Unknown) }),
  [UnknownFields],
);
type UpdateInfo = typeof UpdateInfoSchema.Type;
const isUpdateInfo = Schema.is(UpdateInfoSchema);
const UpdateFileInfo = Schema.StructWithRest(
  Schema.Struct({ url: Schema.NonEmptyString }),
  [UnknownFields],
);
const isUpdateFileInfo = Schema.is(UpdateFileInfo);

function listFilesRecursive(directory: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listFilesRecursive(entryPath));
    } else if (entry.isFile()) {
      entries.push(entryPath);
    }
  }
  return entries;
}

function findMetadataFiles(
  metadataName: string,
  platformDirectoryPrefix: string,
): string[] {
  const files = listFilesRecursive(releaseArtifactsDir)
    .filter((filePath) => path.basename(filePath) === metadataName)
    .filter((filePath) =>
      path.basename(path.dirname(filePath)).startsWith(platformDirectoryPrefix),
    )
    .toSorted();

  if (files.length === 0) {
    throw new Error(
      `No ${metadataName} files found for ${platformDirectoryPrefix}`,
    );
  }

  return files;
}

function findLinuxMetadataFiles(): string[] {
  const files = listFilesRecursive(releaseArtifactsDir)
    .filter((filePath) =>
      /^latest-linux(?:-.+)?\.yml$/u.test(path.basename(filePath)),
    )
    .filter((filePath) =>
      path.basename(path.dirname(filePath)).startsWith("linux-"),
    )
    .toSorted();

  if (files.length === 0) {
    throw new Error("No Linux electron-updater metadata files found");
  }

  return files;
}

function copyAsset(
  sourceFile: string,
  assetName = path.basename(sourceFile),
): void {
  const targetFile = path.join(releaseUploadDir, assetName);
  if (assetNames.has(assetName)) {
    throw new Error(`Duplicate release asset name: ${assetName}`);
  }

  copyFileSync(sourceFile, targetFile);
  assetNames.add(assetName);
}

function isAbsoluteUrl(value: string): boolean {
  return URL.canParse(value);
}

function toGitHubReleaseAssetUrl(
  releaseVersion: string,
  assetPath: string,
): string {
  if (isAbsoluteUrl(assetPath)) {
    return assetPath;
  }

  const assetName = path.posix.basename(assetPath);
  return `${githubReleaseDownloadBaseUrl}/${encodeURIComponent(releaseVersion)}/${encodeURIComponent(assetName)}`;
}

function readUpdateInfo(sourceFile: string): UpdateInfo {
  const updateInfo: unknown = parse(readFileSync(sourceFile, "utf8"));
  if (!isUpdateInfo(updateInfo)) {
    throw new Error(`Invalid electron-updater metadata in ${sourceFile}`);
  }

  return updateInfo;
}

function normalizeUpdateInfoUrls(
  updateInfo: UpdateInfo,
  sourceFile: string,
): UpdateInfo {
  const { version } = updateInfo;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`Invalid release version in ${sourceFile}`);
  }

  const files = updateInfo.files.map((fileInfo) => {
    if (!isUpdateFileInfo(fileInfo)) {
      throw new Error(`Invalid updater file entry in ${sourceFile}`);
    }

    return {
      ...fileInfo,
      url: toGitHubReleaseAssetUrl(version, fileInfo.url),
    };
  });

  return {
    ...updateInfo,
    files,
    ...(typeof updateInfo["path"] === "string"
      ? {
          path: toGitHubReleaseAssetUrl(version, updateInfo["path"]),
        }
      : {}),
  };
}

function writeUpdateInfoAsset(
  outputName: string,
  updateInfo: UpdateInfo,
  sourceFile: string,
): void {
  if (assetNames.has(outputName)) {
    throw new Error(`Duplicate release asset name: ${outputName}`);
  }

  writeFileSync(
    path.join(releaseUploadDir, outputName),
    stringify(normalizeUpdateInfoUrls(updateInfo, sourceFile), {
      lineWidth: 0,
    }),
  );
  assetNames.add(outputName);
}

function copyUpdateInfoAsset(
  sourceFile: string,
  assetName = path.basename(sourceFile),
): void {
  writeUpdateInfoAsset(assetName, readUpdateInfo(sourceFile), sourceFile);
}

function mergeUpdateInfo(outputName: string, sourceFiles: string[]): void {
  const updateInfos = sourceFiles.map((sourceFile) =>
    readUpdateInfo(sourceFile),
  );
  const [baseUpdateInfo] = updateInfos;
  if (baseUpdateInfo === undefined) {
    throw new Error(`No ${outputName} metadata to merge`);
  }
  const version = baseUpdateInfo["version"];

  for (const updateInfo of updateInfos) {
    if (updateInfo["version"] !== version) {
      throw new Error(
        `Cannot merge ${outputName} metadata with mismatched versions`,
      );
    }
  }

  const files = updateInfos.flatMap((updateInfo) => updateInfo.files);
  const mergedUpdateInfo = {
    ...baseUpdateInfo,
    files,
  };

  writeUpdateInfoAsset(outputName, mergedUpdateInfo, outputName);
}

rmSync(releaseUploadDir, { force: true, recursive: true });
mkdirSync(releaseUploadDir, { recursive: true });

for (const filePath of listFilesRecursive(releaseArtifactsDir)) {
  if (electronUpdaterMetadataNames.has(path.basename(filePath))) {
    continue;
  }

  copyAsset(filePath);
}

mergeUpdateInfo("latest.yml", findMetadataFiles("latest.yml", "windows-"));
mergeUpdateInfo(
  "latest-mac.yml",
  findMetadataFiles("latest-mac.yml", "macos-"),
);
for (const linuxMetadataFile of findLinuxMetadataFiles()) {
  copyUpdateInfoAsset(linuxMetadataFile);
}

process.stdout.write("Prepared release assets:\n");
for (const assetName of [...assetNames].toSorted(compareStrings)) {
  process.stdout.write(`${assetName}\n`);
}

// Matches the default sort order, which compares UTF-16 code units.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

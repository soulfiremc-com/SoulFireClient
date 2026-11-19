import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
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
const assetNames = new Set();

function listFilesRecursive(directory) {
  const entries = [];
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

function findMetadataFiles(metadataName, platformDirectoryPrefix) {
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

function findLinuxMetadataFiles() {
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

function copyAsset(sourceFile, assetName = path.basename(sourceFile)) {
  const targetFile = path.join(releaseUploadDir, assetName);
  if (assetNames.has(assetName)) {
    throw new Error(`Duplicate release asset name: ${assetName}`);
  }

  copyFileSync(sourceFile, targetFile);
  assetNames.add(assetName);
}

function isAbsoluteUrl(value) {
  return URL.canParse(value);
}

function toGitHubReleaseAssetUrl(releaseVersion, assetPath) {
  if (isAbsoluteUrl(assetPath)) {
    return assetPath;
  }

  const assetName = path.posix.basename(assetPath);
  return `${githubReleaseDownloadBaseUrl}/${encodeURIComponent(releaseVersion)}/${encodeURIComponent(assetName)}`;
}

function readUpdateInfo(sourceFile) {
  const updateInfo = parse(readFileSync(sourceFile, "utf8"));
  if (
    updateInfo === null ||
    typeof updateInfo !== "object" ||
    !Array.isArray(updateInfo.files)
  ) {
    throw new Error(`Invalid electron-updater metadata in ${sourceFile}`);
  }

  return updateInfo;
}

function normalizeUpdateInfoUrls(updateInfo, sourceFile) {
  if (
    typeof updateInfo.version !== "string" ||
    updateInfo.version.length === 0
  ) {
    throw new Error(`Invalid release version in ${sourceFile}`);
  }

  const files = updateInfo.files.map((fileInfo) => {
    if (
      fileInfo === null ||
      typeof fileInfo !== "object" ||
      typeof fileInfo.url !== "string" ||
      fileInfo.url.length === 0
    ) {
      throw new Error(`Invalid updater file entry in ${sourceFile}`);
    }

    return {
      ...fileInfo,
      url: toGitHubReleaseAssetUrl(updateInfo.version, fileInfo.url),
    };
  });

  return {
    ...updateInfo,
    files,
    ...(typeof updateInfo.path === "string"
      ? {
          path: toGitHubReleaseAssetUrl(updateInfo.version, updateInfo.path),
        }
      : {}),
  };
}

function writeUpdateInfoAsset(outputName, updateInfo, sourceFile) {
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
  sourceFile,
  assetName = path.basename(sourceFile),
) {
  writeUpdateInfoAsset(assetName, readUpdateInfo(sourceFile), sourceFile);
}

function mergeUpdateInfo(outputName, sourceFiles) {
  const updateInfos = sourceFiles.map((sourceFile) =>
    readUpdateInfo(sourceFile),
  );
  const [baseUpdateInfo] = updateInfos;
  const version = baseUpdateInfo.version;

  for (const updateInfo of updateInfos) {
    if (updateInfo.version !== version) {
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
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

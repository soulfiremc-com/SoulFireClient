import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const releaseArtifactsDir = path.resolve(
  process.argv[2] ?? "release-artifacts",
);
const releaseVersion = process.argv[3];

if (!releaseVersion) {
  throw new Error("Release version argument is required");
}

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

function listDirectoriesRecursive(directory) {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      entries.push(entryPath);
      entries.push(...listDirectoriesRecursive(entryPath));
    }
  }
  return entries;
}

function findSingleFile(directory, matcher) {
  const matches = listFilesRecursive(directory).filter((filePath) =>
    matcher(path.basename(filePath)),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one matching file in ${directory}, found ${matches.length}`,
    );
  }

  return matches[0];
}

function isNestedInAppBundle(directory, appBundlePath) {
  const relativeParentPath = path.relative(
    directory,
    path.dirname(appBundlePath),
  );
  if (relativeParentPath === "") {
    return false;
  }

  return relativeParentPath
    .split(path.sep)
    .some((segment) => segment.endsWith(".app"));
}

function createMacUpdaterArchive(zipPath, outputName) {
  const extractionDir = mkdtempSync(path.join(os.tmpdir(), "sf-updater-mac-"));

  try {
    execFileSync("unzip", ["-q", zipPath, "-d", extractionDir], {
      stdio: "inherit",
    });

    const appBundles = listDirectoriesRecursive(extractionDir).filter(
      (candidate) => candidate.endsWith(".app"),
    );
    const topLevelAppBundles = appBundles.filter(
      (candidate) => !isNestedInAppBundle(extractionDir, candidate),
    );
    if (topLevelAppBundles.length !== 1) {
      throw new Error(
        `Expected exactly one top-level .app bundle in ${zipPath}, found ${topLevelAppBundles.length}`,
      );
    }

    const [appBundle] = topLevelAppBundles;
    const outputPath = path.join(releaseArtifactsDir, outputName);

    execFileSync(
      "tar",
      [
        "-czf",
        outputPath,
        "-C",
        path.dirname(appBundle),
        path.basename(appBundle),
      ],
      {
        stdio: "inherit",
      },
    );

    return outputPath;
  } finally {
    rmSync(extractionDir, { force: true, recursive: true });
  }
}

function signArtifact(filePath) {
  execFileSync("bunx", ["@tauri-apps/cli@2.10.0", "signer", "sign", filePath], {
    env: process.env,
    stdio: "inherit",
  });

  const signaturePath = `${filePath}.sig`;
  const signature = readFileSync(signaturePath, "utf8").trim();
  return {
    signature,
    signaturePath,
  };
}

const artifactMap = {
  "windows-x86_64": findSingleFile(
    path.join(releaseArtifactsDir, "windows-x64"),
    (name) => name.endsWith(".exe"),
  ),
  "windows-aarch64": findSingleFile(
    path.join(releaseArtifactsDir, "windows-arm64"),
    (name) => name.endsWith(".exe"),
  ),
  "linux-x86_64": findSingleFile(
    path.join(releaseArtifactsDir, "linux-x64"),
    (name) => name.endsWith(".AppImage"),
  ),
  "linux-aarch64": findSingleFile(
    path.join(releaseArtifactsDir, "linux-arm64"),
    (name) => name.endsWith(".AppImage"),
  ),
  "darwin-x86_64": createMacUpdaterArchive(
    findSingleFile(path.join(releaseArtifactsDir, "macos-x64"), (name) =>
      name.endsWith(".zip"),
    ),
    `SoulFire-${releaseVersion}-x64.app.tar.gz`,
  ),
  "darwin-aarch64": createMacUpdaterArchive(
    findSingleFile(path.join(releaseArtifactsDir, "macos-arm64"), (name) =>
      name.endsWith(".zip"),
    ),
    `SoulFire-${releaseVersion}-arm64.app.tar.gz`,
  ),
};

const platforms = Object.fromEntries(
  Object.entries(artifactMap).map(([target, filePath]) => {
    const { signature } = signArtifact(filePath);

    return [
      target,
      {
        signature,
        url: `https://github.com/soulfiremc-com/SoulFireClient/releases/download/${releaseVersion}/${path.basename(filePath)}`,
      },
    ];
  }),
);

const latestManifest = {
  version: releaseVersion,
  notes: "See the assets to download this version and install.",
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(
  path.join(releaseArtifactsDir, "latest.json"),
  JSON.stringify(latestManifest, null, 2),
);

for (const filePath of Object.values(artifactMap)) {
  const signaturePath = `${filePath}.sig`;
  if (statSync(signaturePath, { throwIfNoEntry: false })) {
    rmSync(signaturePath, { force: true });
  }
}

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appBuilderPath } from "app-builder-bin";
import { Option, Schema } from "effect";

const BlockMapInfo = Schema.fromJsonString(
  Schema.Struct({
    size: Schema.Finite,
    sha512: Schema.String,
  }),
);

const releaseArtifactsDir = path.resolve(
  process.argv[2] ?? "release-artifacts",
);

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

function findSingleTopLevelFile(
  directory: string,
  matcher: (name: string) => boolean,
): string {
  const matches = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matcher(entry.name))
    .map((entry) => path.join(directory, entry.name));

  const [match] = matches;
  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `Expected exactly one matching file in ${directory}, found ${matches.length}`,
    );
  }

  return match;
}

const signedInstallerPath = findSingleTopLevelFile(
  releaseArtifactsDir,
  (name) => name.endsWith(".exe"),
);
const signedInstallerName = path.basename(signedInstallerPath);
const blockMapPath = `${signedInstallerPath}.blockmap`;
const signedInstallerInfo = Schema.decodeOption(BlockMapInfo)(
  execFileSync(
    appBuilderPath,
    ["blockmap", "--input", signedInstallerPath, "--output", blockMapPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  ),
).pipe(
  Option.filter((info) => Number.isSafeInteger(info.size)),
  Option.getOrThrowWith(
    () => new TypeError("app-builder returned invalid blockmap metadata"),
  ),
);
const blockMapSize = statSync(blockMapPath).size;
const metadataFiles = listFilesRecursive(releaseArtifactsDir).filter(
  (filePath) => /\.(ya?ml)$/iu.test(filePath),
);

function updateBlockMapSize(metadata: string): string {
  if (/^\s+blockMapSize:\s*\d+$/mu.test(metadata)) {
    return metadata.replace(
      /^(\s+blockMapSize:\s*)\d+$/mu,
      `$1${blockMapSize}`,
    );
  }

  const updatedMetadata = metadata.replace(
    /^(\s+)size:\s*\d+$/mu,
    `$1size: ${signedInstallerInfo.size}\n$1blockMapSize: ${blockMapSize}`,
  );
  if (updatedMetadata === metadata) {
    throw new Error("Could not insert blockMapSize into updater metadata");
  }

  return updatedMetadata;
}

let updatedMetadataFiles = 0;
for (const metadataFile of metadataFiles) {
  const metadata = readFileSync(metadataFile, "utf8");
  if (!metadata.includes(signedInstallerName)) {
    continue;
  }

  const updatedMetadata = updateBlockMapSize(metadata)
    .replaceAll(/^(\s*sha512:\s*).+$/gmu, `$1${signedInstallerInfo.sha512}`)
    .replaceAll(/^(\s*size:\s*)\d+$/gmu, `$1${signedInstallerInfo.size}`);

  writeFileSync(metadataFile, updatedMetadata);
  updatedMetadataFiles += 1;
}

if (updatedMetadataFiles === 0) {
  throw new Error(
    `No Electron updater metadata referenced ${signedInstallerName}`,
  );
}

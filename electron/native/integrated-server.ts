import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import type { App } from "electron";
import * as tar from "tar";
import { getAppLocalDataDir } from "./app-paths";
import { downloadToFile } from "./integrated-server-download";
import {
  appendIntegratedLog,
  type IntegratedServerState,
  startIntegratedOperation,
  waitForIntegratedServerReady,
} from "./integrated-server-process";

const require = createRequire(__filename);
const AdmZip = require("adm-zip") as {
  new (
    path: string,
  ): {
    extractAllToAsync: (
      targetPath: string,
      overwrite?: boolean,
    ) => Promise<unknown>;
    getEntries: () => Array<{
      entryName: string;
      isDirectory: boolean;
    }>;
  };
};

const ROOT_USER_UUID = "00000000-0000-0000-0000-000000000000";

export type IntegratedServerJarSource =
  | {
      type: "official";
    }
  | {
      jarId: string;
      type: "custom";
    };

export type CustomSoulFireServerJar = {
  id: string;
  importedAt: string;
  originalName: string;
  path: string;
  sha256: string;
  size: number;
};

type CustomSoulFireServerJarIndex = {
  jars: CustomSoulFireServerJar[];
};

export async function getSoulFireServerVersion(
  app: App,
  fallbackVersion: string,
): Promise<string> {
  try {
    const versionPath = path.join(
      app.getAppPath(),
      "soulfire-server-version.txt",
    );
    const contents = await readFile(versionPath, "utf8");
    const version = contents.trim();
    if (version.length > 0) {
      return version;
    }
  } catch {}

  return fallbackVersion;
}

export async function resetIntegratedData(app: App): Promise<void> {
  const appLocalDataDir = getAppLocalDataDir(app);

  await rm(path.join(appLocalDataDir, "jvm-25"), {
    force: true,
    recursive: true,
  });
  await rm(path.join(appLocalDataDir, "jars"), {
    force: true,
    recursive: true,
  });
}

export async function runIntegratedServer(
  app: App,
  state: IntegratedServerState,
  jvmArgs: string[],
  jarSource: IntegratedServerJarSource,
  fallbackVersion: string,
): Promise<string | null> {
  return startIntegratedOperation(state, async (signal) => {
    const report = (message: string) => {
      if (!signal.aborted) appendIntegratedLog(state, message);
    };
    const serverVersion = await getSoulFireServerVersion(app, fallbackVersion);
    const appLocalDataDir = getAppLocalDataDir(app);
    await mkdir(appLocalDataDir, {
      recursive: true,
    });

    const jvmDir = path.join(appLocalDataDir, "jvm-25");
    state.diagnostics.dataDirectory =
      jarSource.type === "custom"
        ? path.join(appLocalDataDir, "soulfire-custom", jarSource.jarId)
        : path.join(appLocalDataDir, "soulfire");
    await ensureJvm(jvmDir, report, signal);
    signal.throwIfAborted();

    const { jarPath: soulFireJarPath, runDir: soulFireRunDir } =
      await resolveSoulFireJar(
        app,
        appLocalDataDir,
        serverVersion,
        jarSource,
        report,
        signal,
      );
    await mkdir(soulFireRunDir, {
      recursive: true,
    });

    const javaHomeDir = getJavaHomeDir(jvmDir);
    const javaExecPath = path.join(javaHomeDir, "bin", getJavaExecutableName());
    const availablePort = await findRandomAvailablePort();

    signal.throwIfAborted();
    Object.assign(state.diagnostics, {
      javaPath: javaExecPath,
      jarPath: soulFireJarPath,
      dataDirectory: soulFireRunDir,
      port: availablePort,
    });
    report("Starting SoulFire server...");

    const child = spawn(
      javaExecPath,
      [...jvmArgs, `-Dsf.grpc.port=${availablePort}`, "-jar", soulFireJarPath],
      {
        cwd: soulFireRunDir,
        env: {
          ...process.env,
          JAVA_HOME: javaHomeDir,
          LD_LIBRARY_PATH: [
            path.join(javaHomeDir, "lib"),
            path.join(javaHomeDir, "lib", "server"),
            process.env.LD_LIBRARY_PATH ?? "",
          ].join(path.delimiter),
          DYLD_LIBRARY_PATH: [
            path.join(javaHomeDir, "lib"),
            path.join(javaHomeDir, "lib", "server"),
            process.env.DYLD_LIBRARY_PATH ?? "",
          ].join(path.delimiter),
        },
        stdio: "pipe",
        windowsHide: true,
      },
    );

    await waitForIntegratedServerReady(state, child, signal);
    signal.throwIfAborted();

    const secretKey = await readFile(
      path.join(soulFireRunDir, "secret-key.bin"),
    );
    const token = createRootApiToken(secretKey);
    return `http://127.0.0.1:${availablePort}\n${token}`;
  });
}

export async function listCustomSoulFireServerJars(
  app: App,
): Promise<CustomSoulFireServerJar[]> {
  const index = await readCustomJarIndex(app);
  const existingJars = (
    await Promise.all(
      index.jars.map(async (jar) => ((await exists(jar.path)) ? jar : null)),
    )
  ).filter((jar) => jar !== null);

  if (existingJars.length !== index.jars.length) {
    await writeCustomJarIndex(app, {
      jars: existingJars,
    });
  }

  return [...existingJars].sort((a, b) =>
    b.importedAt.localeCompare(a.importedAt),
  );
}

export async function importCustomSoulFireServerJar(
  app: App,
  sourcePath: string,
): Promise<CustomSoulFireServerJar> {
  if (path.extname(sourcePath).toLowerCase() !== ".jar") {
    throw new Error("Custom SoulFire server file must be a jar");
  }

  await validateJar(sourcePath);

  const fileStat = await stat(sourcePath);
  if (!fileStat.isFile()) {
    throw new Error("Custom SoulFire server jar path is not a file");
  }

  const sha256 = await sha256FileHex(sourcePath);
  const customJarsDir = getCustomJarsDir(app);
  await mkdir(customJarsDir, {
    recursive: true,
  });

  const jarPath = path.join(customJarsDir, `${sha256}.jar`);
  if (!(await exists(jarPath))) {
    await copyFile(sourcePath, jarPath);
  }

  const jar: CustomSoulFireServerJar = {
    id: sha256,
    importedAt: new Date().toISOString(),
    originalName: path.basename(sourcePath),
    path: jarPath,
    sha256,
    size: fileStat.size,
  };
  const index = await readCustomJarIndex(app);
  await writeCustomJarIndex(app, {
    jars: [
      jar,
      ...index.jars.filter((existingJar) => existingJar.id !== jar.id),
    ],
  });

  return jar;
}

export async function removeCustomSoulFireServerJar(
  app: App,
  jarId: string,
): Promise<void> {
  const index = await readCustomJarIndex(app);
  const jar = index.jars.find((entry) => entry.id === jarId);
  if (jar !== undefined) {
    await unlink(jar.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }

  await writeCustomJarIndex(app, {
    jars: index.jars.filter((entry) => entry.id !== jarId),
  });
}

async function resolveSoulFireJar(
  app: App,
  appLocalDataDir: string,
  serverVersion: string,
  jarSource: IntegratedServerJarSource,
  report: (message: string) => void,
  signal: AbortSignal,
): Promise<{
  jarPath: string;
  runDir: string;
}> {
  if (jarSource.type === "custom") {
    const jar = await findCustomSoulFireServerJar(app, jarSource.jarId);
    if (jar === null || !(await exists(jar.path))) {
      throw new Error("Custom SoulFire server jar is no longer available");
    }

    report(`Using custom SoulFire jar: ${jar.originalName}`);

    return {
      jarPath: jar.path,
      runDir: path.join(appLocalDataDir, "soulfire-custom", jar.id),
    };
  }

  const jarsDir = path.join(appLocalDataDir, "jars");
  await mkdir(jarsDir, {
    recursive: true,
  });

  const soulFireJarName = `SoulFireDedicated-${serverVersion}.jar`;
  const soulFireJarPath = path.join(jarsDir, soulFireJarName);
  await ensureSoulFireJar(
    serverVersion,
    soulFireJarName,
    soulFireJarPath,
    report,
    signal,
  );

  return {
    jarPath: soulFireJarPath,
    runDir: path.join(appLocalDataDir, "soulfire"),
  };
}

async function findCustomSoulFireServerJar(
  app: App,
  jarId: string,
): Promise<CustomSoulFireServerJar | null> {
  const index = await readCustomJarIndex(app);
  return index.jars.find((jar) => jar.id === jarId) ?? null;
}

function getCustomJarsDir(app: App): string {
  return path.join(getAppLocalDataDir(app), "custom-jars");
}

function getCustomJarIndexPath(app: App): string {
  return path.join(getCustomJarsDir(app), "index.json");
}

async function readCustomJarIndex(
  app: App,
): Promise<CustomSoulFireServerJarIndex> {
  try {
    const rawIndex = JSON.parse(
      await readFile(getCustomJarIndexPath(app), "utf8"),
    ) as Partial<CustomSoulFireServerJarIndex>;

    return {
      jars: Array.isArray(rawIndex.jars)
        ? rawIndex.jars.filter(isCustomSoulFireServerJar)
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        jars: [],
      };
    }

    throw error;
  }
}

async function writeCustomJarIndex(
  app: App,
  index: CustomSoulFireServerJarIndex,
): Promise<void> {
  const customJarsDir = getCustomJarsDir(app);
  await mkdir(customJarsDir, {
    recursive: true,
  });

  await writeFile(
    getCustomJarIndexPath(app),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );
}

function isCustomSoulFireServerJar(
  value: unknown,
): value is CustomSoulFireServerJar {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const jar = value as Record<string, unknown>;
  return (
    typeof jar.id === "string" &&
    typeof jar.importedAt === "string" &&
    typeof jar.originalName === "string" &&
    typeof jar.path === "string" &&
    typeof jar.sha256 === "string" &&
    typeof jar.size === "number"
  );
}

async function validateJar(jarPath: string): Promise<void> {
  let zip: InstanceType<typeof AdmZip>;
  try {
    zip = new AdmZip(jarPath);
  } catch {
    throw new Error("Custom SoulFire server jar is not a valid jar file");
  }

  const hasManifest = zip
    .getEntries()
    .some(
      (entry) =>
        !entry.isDirectory &&
        entry.entryName.toUpperCase() === "META-INF/MANIFEST.MF",
    );
  if (!hasManifest) {
    throw new Error("Custom SoulFire server jar is missing a manifest");
  }
}

async function ensureJvm(
  jvmDir: string,
  report: (message: string) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (
    await exists(
      path.join(getJavaHomeDir(jvmDir), "bin", getJavaExecutableName()),
    )
  ) {
    report("JVM detected");
    return;
  }

  const adoptiumOs = detectOs();
  const adoptiumArch = detectArchitecture();
  const jvmUrl = `https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=${adoptiumArch}&image_type=jre&os=${adoptiumOs}&vendor=eclipse`;

  report("Fetching JVM data...");
  const metadataResponse = await fetch(jvmUrl, { signal });
  if (!metadataResponse.ok) {
    throw new Error("Failed to fetch JVM metadata");
  }

  const metadata = (await metadataResponse.json()) as Array<{
    binary?: {
      package?: {
        checksum?: string;
        link?: string;
      };
    };
    release_name?: string;
  }>;
  const release = metadata[0];
  const checksum = release?.binary?.package?.checksum;
  const downloadUrl = release?.binary?.package?.link;
  const releaseName = release?.release_name;
  if (!checksum || !downloadUrl || !releaseName) {
    throw new Error("JVM metadata was incomplete");
  }

  const archiveTmpPath = `${jvmDir}.download`;
  const extractTmpRoot = `${jvmDir}.extract`;
  await rm(archiveTmpPath, {
    force: true,
  });
  await rm(extractTmpRoot, {
    force: true,
    recursive: true,
  });

  try {
    await downloadToFile(downloadUrl, archiveTmpPath, signal, (percent) => {
      report(`Downloading JVM... ${percent}%`);
    });
    await verifyFileChecksum(archiveTmpPath, checksum, "JVM", signal);
    signal.throwIfAborted();

    report("Extracting JVM...");
    await mkdir(extractTmpRoot, {
      recursive: true,
    });

    if (downloadUrl.endsWith(".zip")) {
      const zip = new AdmZip(archiveTmpPath);
      await zip.extractAllToAsync(extractTmpRoot, true);
    } else if (downloadUrl.endsWith(".tar.gz")) {
      await tar.x({
        cwd: extractTmpRoot,
        file: archiveTmpPath,
      });
    } else {
      throw new Error("Unsupported JVM archive type");
    }

    const extractedJvmDir = path.join(extractTmpRoot, `${releaseName}-jre`);
    const extractedJavaExec = path.join(
      getJavaHomeDir(extractedJvmDir),
      "bin",
      getJavaExecutableName(),
    );
    if (!(await exists(extractedJavaExec))) {
      throw new Error("Extracted JVM is missing the Java executable");
    }

    signal.throwIfAborted();
    await atomicReplaceDirectory(extractedJvmDir, jvmDir);
  } finally {
    await rm(archiveTmpPath, {
      force: true,
    });
    await rm(extractTmpRoot, {
      force: true,
      recursive: true,
    });
  }
  signal.throwIfAborted();
  report("Downloaded JVM");
}

async function ensureSoulFireJar(
  version: string,
  jarName: string,
  jarPath: string,
  report: (message: string) => void,
  signal: AbortSignal,
): Promise<void> {
  report("Fetching SoulFire checksum metadata...");

  const expectedChecksum = await fetchSoulFireJarChecksum(
    version,
    jarName,
    signal,
  );
  if (await exists(jarPath)) {
    const existingChecksum = await sha256FileHex(jarPath, signal);
    if (existingChecksum.toLowerCase() === expectedChecksum.toLowerCase()) {
      report("SoulFire already downloaded and verified");
      return;
    }
  }

  const jarUrl = `https://github.com/soulfiremc-com/SoulFire/releases/download/${version}/${jarName}`;
  const tempJarPath = `${jarPath}.download`;
  await rm(tempJarPath, {
    force: true,
  });

  report("Fetching SoulFire data...");
  try {
    await downloadToFile(jarUrl, tempJarPath, signal, (percent) => {
      report(`Downloading SoulFire... ${percent}%`);
    });
    await verifyFileChecksum(
      tempJarPath,
      expectedChecksum,
      "SoulFire jar",
      signal,
    );
    signal.throwIfAborted();
    await atomicReplaceFile(tempJarPath, jarPath);
  } finally {
    await rm(tempJarPath, { force: true });
  }
  report("Downloaded SoulFire");
}

async function fetchSoulFireJarChecksum(
  version: string,
  jarName: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/soulfiremc-com/SoulFire/releases/tags/${version}`,
    {
      signal,
      headers: {
        "User-Agent": "SoulFireClient",
      },
    },
  );
  if (!response.ok) {
    throw new Error("Failed to fetch SoulFire release metadata");
  }

  const release = (await response.json()) as {
    assets?: Array<{
      name?: string;
      digest?: string;
    }>;
  };
  const asset = release.assets?.find((entry) => entry.name === jarName);
  const digest = asset?.digest?.replace(/^sha256:/, "");
  if (!digest) {
    throw new Error("SoulFire release metadata did not include a checksum");
  }

  return digest;
}

async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
  label: string,
  signal: AbortSignal,
): Promise<void> {
  const actualChecksum = await sha256FileHex(filePath, signal);
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error(`${label} checksum verification failed`);
  }
}

async function sha256FileHex(
  filePath: string,
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath, { signal });

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  return hash.digest("hex");
}

async function atomicReplaceDirectory(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  const replacementPath = `${targetPath}.tmp`;
  await rm(replacementPath, {
    force: true,
    recursive: true,
  });
  await rename(sourcePath, replacementPath);
  await rm(targetPath, {
    force: true,
    recursive: true,
  });
  await rename(replacementPath, targetPath);
}

async function atomicReplaceFile(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await mkdir(path.dirname(targetPath), {
    recursive: true,
  });
  if (await exists(targetPath)) {
    await rm(targetPath, {
      force: true,
    });
  }
  await copyFile(sourcePath, targetPath);
  await rm(sourcePath, {
    force: true,
  });
}

function createRootApiToken(secretKey: Buffer): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    }),
  );
  const claims = base64urlEncode(
    JSON.stringify({
      sub: ROOT_USER_UUID,
      iat: issuedAt,
      aud: ["api"],
    }),
  );
  const unsignedToken = `${header}.${claims}`;
  const signature = createHmac("sha256", secretKey)
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function base64urlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function detectArchitecture(): string {
  switch (process.arch) {
    case "x64":
      return "x64";
    case "ia32":
      return "x32";
    case "ppc64":
      return "ppc64";
    case "s390x":
      return "s390x";
    case "arm64":
      return "aarch64";
    case "arm":
      return "arm";
    case "riscv64":
      return "riscv64";
    default:
      return "unknown";
  }
}

function detectOs(): string {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    case "darwin":
      return "mac";
    default:
      return "unknown";
  }
}

function getJavaExecutableName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

function getJavaHomeDir(baseDir: string): string {
  if (process.platform === "darwin") {
    return path.join(baseDir, "Contents", "Home");
  }
  return baseDir;
}

async function findRandomAvailablePort(): Promise<number> {
  const server = net.createServer();

  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an available port"));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

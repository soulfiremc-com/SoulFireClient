import { spawn } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import type { App } from "electron";
import { DateTime, Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import * as tar from "tar";
import { getAppLocalDataDir } from "./app-paths";
import { downloadToFileEffect } from "./integrated-server-download";
import {
  clearIntegratedServerPid,
  stopStaleIntegratedServer,
  writeIntegratedServerPid,
} from "./integrated-server-pid";
import { hasJarManifest } from "./jar-manifest";
import { findBlockedJvmArg } from "./jvm-args";
import {
  appendIntegratedLog,
  type IntegratedServerState,
  startIntegratedOperation,
  waitForIntegratedServerReady,
  IntegratedServerError,
} from "./integrated-server-process";

const require = createRequire(__filename);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- adm-zip is loaded with require so its types are declared here
const AdmZip = require("adm-zip") as {
  new (archive: Buffer): {
    extractAllToAsync: (
      targetPath: string,
      overwrite?: boolean,
    ) => Promise<unknown>;
  };
};

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const encodeJarIndex = Schema.encodeSync(
  Schema.fromJsonString(Schema.Unknown, { space: 2 }),
);

function fetchMetadata(
  url: string,
  signal: AbortSignal,
  errorMessage: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  return Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Effect v4 exposes HTTP clients through its unstable HTTP module
    HttpClient.get(url, headers ? { headers } : undefined).pipe(
      // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Status checks use the same Effect HTTP client response API
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        IntegratedServerError.make({ message: errorMessage }),
      ),
      Effect.flatMap((response) => response.json),
      // oxlint-disable-next-line effecttsgo/unstable-api-usage -- The metadata requests use the Fetch implementation of the Effect HTTP client
      Effect.provide(FetchHttpClient.layer),
    ),
    { signal },
  );
}

const preparationStep = <A>(operation: () => Promise<A>) =>
  Effect.uninterruptible(
    Effect.tryPromise({ try: operation, catch: (error) => error }),
  );

function temporaryPath(filePath: string, recursive = false) {
  const remove = Effect.promise(() => rm(filePath, { force: true, recursive }));
  return Effect.acquireRelease(remove, () => remove);
}

const ROOT_USER_UUID = "00000000-0000-0000-0000-000000000000";

// An empty entry in a library search path means the current directory, which
// for Java is the writable data directory. Only keep real entries.
function libraryPath(javaHomeDir: string, parent: string | undefined) {
  return [
    path.join(javaHomeDir, "lib"),
    path.join(javaHomeDir, "lib", "server"),
    ...(parent ?? "").split(path.delimiter),
  ]
    .filter((entry) => entry !== "")
    .join(path.delimiter);
}

export function integratedServerEnvironment(
  javaHomeDir: string,
  parentEnvironment: NodeJS.ProcessEnv,
) {
  return {
    ...parentEnvironment,
    JAVA_HOME: javaHomeDir,
    LD_LIBRARY_PATH: libraryPath(
      javaHomeDir,
      parentEnvironment["LD_LIBRARY_PATH"],
    ),
    DYLD_LIBRARY_PATH: libraryPath(
      javaHomeDir,
      parentEnvironment["DYLD_LIBRARY_PATH"],
    ),
  };
}

export type IntegratedServerJarSource =
  | {
      type: "official";
    }
  | {
      jarId: string;
      type: "custom";
    };

export interface CustomSoulFireServerJar {
  id: string;
  importedAt: string;
  originalName: string;
  path: string;
  sha256: string;
  size: number;
}

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

const CUSTOM_JAR_ID = /^[\da-f]{64}$/u;

export async function runIntegratedServer(
  app: App,
  state: IntegratedServerState,
  jvmArgs: string[],
  jarSource: IntegratedServerJarSource,
  fallbackVersion: string,
  forceSoftwareRendering = false,
): Promise<string | null> {
  return startIntegratedOperation(state, (signal) =>
    Effect.gen(function* () {
      const report = (message: string) => {
        if (!signal.aborted) appendIntegratedLog(state, message);
      };
      const blockedArg = findBlockedJvmArg(jvmArgs);
      if (blockedArg !== null) {
        throw new Error(
          `The JVM argument "${blockedArg}" is not allowed because it can load code from outside SoulFire. Remove it from the JVM arguments.`,
        );
      }
      // Custom jar IDs are SHA-256 hashes. The ID becomes part of the data
      // directory path, so reject anything else before it is used there.
      if (jarSource.type === "custom" && !CUSTOM_JAR_ID.test(jarSource.jarId)) {
        throw new Error("Custom SoulFire server jar is no longer available");
      }
      const serverVersion = yield* preparationStep(() =>
        getSoulFireServerVersion(app, fallbackVersion),
      );
      if (
        forceSoftwareRendering &&
        jarSource.type === "official" &&
        Number(serverVersion.split(".")[0]) === 2 &&
        Number(serverVersion.split(".")[1]) < 11
      ) {
        throw new Error(
          "Software rendering requires SoulFire server 2.11 or newer. Import an updated server jar or turn off software rendering.",
        );
      }
      const appLocalDataDir = getAppLocalDataDir(app);
      yield* preparationStep(() => mkdir(appLocalDataDir, { recursive: true }));

      const jvmDir = path.join(appLocalDataDir, "jvm-25");
      state.diagnostics.dataDirectory =
        jarSource.type === "custom"
          ? path.join(appLocalDataDir, "soulfire-custom", jarSource.jarId)
          : path.join(appLocalDataDir, "soulfire");
      yield* ensureJvm(jvmDir, report, signal);
      signal.throwIfAborted();

      const { jarPath: soulFireJarPath, runDir: soulFireRunDir } =
        yield* resolveSoulFireJar(
          app,
          appLocalDataDir,
          serverVersion,
          jarSource,
          report,
          signal,
        );
      yield* preparationStep(() => mkdir(soulFireRunDir, { recursive: true }));

      const javaHomeDir = getJavaHomeDir(jvmDir);
      const javaExecPath = path.join(
        javaHomeDir,
        "bin",
        getJavaExecutableName(),
      );
      const availablePort = yield* preparationStep(() =>
        findRandomAvailablePort(),
      );

      // A Java process from a crashed session would share the data directory.
      const pidFilePath = path.join(appLocalDataDir, "integrated-server.pid");
      yield* preparationStep(() =>
        stopStaleIntegratedServer(pidFilePath, report),
      );

      signal.throwIfAborted();
      Object.assign(state.diagnostics, {
        javaPath: javaExecPath,
        jarPath: soulFireJarPath,
        dataDirectory: soulFireRunDir,
        port: availablePort,
      });
      report("Starting SoulFire server...");
      if (forceSoftwareRendering) {
        report("Forcing software rendering for the integrated server.");
      }

      const child = spawn(
        javaExecPath,
        [
          // Match Minecraft's JVM defaults, including saved argument presets.
          "-XX:StackShadowPages=32",
          "--add-exports=java.base/jdk.internal.misc=ALL-UNNAMED",
          "-XX:+UseStringDeduplication",
          ...(process.platform === "darwin" ? ["-XstartOnFirstThread"] : []),
          ...jvmArgs,
          ...(forceSoftwareRendering ? ["-Dsf.vulkan.software=true"] : []),
          `-Dsf.grpc.port=${availablePort}`,
          "-jar",
          soulFireJarPath,
        ],
        {
          cwd: soulFireRunDir,
          env: integratedServerEnvironment(javaHomeDir, process.env),
          stdio: "pipe",
          windowsHide: true,
        },
      );
      const { pid } = child;
      if (pid !== undefined) {
        // Do not yield here: the child is not tracked for cleanup until
        // waitForIntegratedServerReady below.
        const recorded = writeIntegratedServerPid(pidFilePath, {
          pid,
          jarPath: soulFireJarPath,
          startedAt: DateTime.toEpochMillis(DateTime.nowUnsafe()),
        }).catch((error: unknown) => {
          report(`Could not record the Java process ID: ${String(error)}`);
        });
        child.once("close", () => {
          void recorded
            .then(() => clearIntegratedServerPid(pidFilePath, pid))
            .catch(() => {});
        });
      }

      yield* Effect.tryPromise({
        try: () => waitForIntegratedServerReady(state, child, signal),
        catch: (error) => error,
      });
      signal.throwIfAborted();

      const secretKey = yield* preparationStep(() =>
        readFile(path.join(soulFireRunDir, "secret-key.bin")),
      );
      const token = createRootApiToken(secretKey);
      return `http://127.0.0.1:${availablePort}\n${token}`;
    }),
  );
}

export async function listCustomSoulFireServerJars(
  app: App,
): Promise<CustomSoulFireServerJar[]> {
  return updateCustomJarIndex(app, async (jars) => {
    const existingJars = (
      await Promise.all(
        jars.map(async (jar) => ((await exists(jar.path)) ? jar : null)),
      )
    ).filter((jar) => jar !== null);
    return {
      jars: existingJars.length === jars.length ? null : existingJars,
      result: existingJars.toSorted((a, b) =>
        b.importedAt.localeCompare(a.importedAt),
      ),
    };
  });
}

export async function importCustomSoulFireServerJar(
  app: App,
  sourcePath: string,
): Promise<CustomSoulFireServerJar> {
  if (path.extname(sourcePath).toLowerCase() !== ".jar") {
    throw new Error("Custom SoulFire server file must be a jar");
  }
  const fileStat = await stat(sourcePath);
  if (!fileStat.isFile()) {
    throw new Error("Custom SoulFire server jar path is not a file");
  }

  const customJarsDir = getCustomJarsDir(app);
  await mkdir(customJarsDir, { recursive: true });
  // Check and hash the copy, so a source that changes during import cannot
  // be stored under a hash that does not match its content.
  const temporaryJarPath = path.join(
    customJarsDir,
    `import-${randomUUID()}.jar.tmp`,
  );
  try {
    await copyFile(sourcePath, temporaryJarPath);
    if (!(await hasJarManifest(temporaryJarPath).catch(() => false))) {
      throw new Error(
        "Custom SoulFire server jar is not a valid jar file with a manifest",
      );
    }
    const sha256 = await sha256FileHex(temporaryJarPath);
    const { size } = await stat(temporaryJarPath);
    const jarPath = customJarPath(app, sha256);
    // A running server can lock the existing jar on Windows, so keep a
    // matching copy instead of replacing it.
    const existingSha256 = (await exists(jarPath))
      ? await sha256FileHex(jarPath).catch(() => null)
      : null;
    if (existingSha256 !== sha256) await rename(temporaryJarPath, jarPath);

    const jar: CustomSoulFireServerJar = {
      id: sha256,
      importedAt: DateTime.formatIso(DateTime.nowUnsafe()),
      originalName: path.basename(sourcePath),
      path: jarPath,
      sha256,
      size,
    };
    await updateCustomJarIndex(app, (jars) => ({
      jars: [jar, ...jars.filter((existingJar) => existingJar.id !== jar.id)],
      result: undefined,
    }));
    return jar;
  } finally {
    await rm(temporaryJarPath, { force: true });
  }
}

export async function removeCustomSoulFireServerJar(
  app: App,
  jarId: string,
): Promise<void> {
  await updateCustomJarIndex(app, async (jars) => {
    if (CUSTOM_JAR_ID.test(jarId))
      await rm(customJarPath(app, jarId), { force: true });
    return {
      jars: jars.filter((entry) => entry.id !== jarId),
      result: undefined,
    };
  });
}

function resolveSoulFireJar(
  app: App,
  appLocalDataDir: string,
  serverVersion: string,
  jarSource: IntegratedServerJarSource,
  report: (message: string) => void,
  signal: AbortSignal,
): Effect.Effect<
  {
    jarPath: string;
    runDir: string;
  },
  unknown
> {
  return Effect.gen(function* () {
    if (jarSource.type === "custom") {
      const jar = yield* preparationStep(() =>
        findCustomSoulFireServerJar(app, jarSource.jarId),
      );
      if (jar === null || !(yield* preparationStep(() => exists(jar.path)))) {
        throw new Error("Custom SoulFire server jar is no longer available");
      }

      report(`Using custom SoulFire jar: ${jar.originalName}`);

      return {
        jarPath: jar.path,
        runDir: path.join(appLocalDataDir, "soulfire-custom", jar.id),
      };
    }

    const jarsDir = path.join(appLocalDataDir, "jars");
    yield* preparationStep(() => mkdir(jarsDir, { recursive: true }));

    const soulFireJarName = `SoulFireDedicated-${serverVersion}.jar`;
    const soulFireJarPath = path.join(jarsDir, soulFireJarName);
    yield* ensureSoulFireJar(
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
  });
}

async function findCustomSoulFireServerJar(
  app: App,
  jarId: string,
): Promise<CustomSoulFireServerJar | null> {
  return updateCustomJarIndex(app, (jars) => ({
    jars: null,
    result: jars.find((jar) => jar.id === jarId) ?? null,
  }));
}

function getCustomJarsDir(app: App): string {
  return path.join(getAppLocalDataDir(app), "custom-jars");
}

function customJarPath(app: App, sha256: string): string {
  return path.join(getCustomJarsDir(app), `${sha256}.jar`);
}

const decodeCustomJarIndex = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ jars: Schema.Array(Schema.Unknown) })),
);
const isCustomJarEntry = Schema.is(
  Schema.Struct({
    id: Schema.String,
    importedAt: Schema.String,
    originalName: Schema.String,
    sha256: Schema.String,
    size: Schema.Finite,
  }),
);

let customJarIndexQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs one read or update of the custom jar index at a time. The update
 * returns the new jar list, or null to leave the file unchanged.
 */
function updateCustomJarIndex<A>(
  app: App,
  update: (
    jars: CustomSoulFireServerJar[],
  ) =>
    | { jars: CustomSoulFireServerJar[] | null; result: A }
    | Promise<{ jars: CustomSoulFireServerJar[] | null; result: A }>,
): Promise<A> {
  const run = async () => {
    const indexPath = path.join(getCustomJarsDir(app), "index.json");
    const { jars, result } = await update(await readCustomJarIndex(app));
    if (jars !== null) {
      await mkdir(path.dirname(indexPath), { recursive: true });
      const temporary = `${indexPath}.tmp`;
      await writeFile(temporary, `${encodeJarIndex({ jars })}\n`, "utf8");
      await rename(temporary, indexPath);
    }
    return result;
  };
  const pending = customJarIndexQueue.then(run, run);
  customJarIndexQueue = pending.catch(() => undefined);
  return pending;
}

async function readCustomJarIndex(
  app: App,
): Promise<CustomSoulFireServerJar[]> {
  const indexPath = path.join(getCustomJarsDir(app), "index.json");
  let contents: string;
  try {
    contents = await readFile(indexPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  try {
    // Paths come from the ID, so an edited index cannot point at other files.
    return decodeCustomJarIndex(contents)
      .jars.filter(isCustomJarEntry)
      .filter((jar) => CUSTOM_JAR_ID.test(jar.id))
      .map((jar) => ({
        id: jar.id,
        importedAt: jar.importedAt,
        originalName: jar.originalName,
        path: customJarPath(app, jar.id),
        sha256: jar.sha256,
        size: jar.size,
      }));
  } catch {
    // Keep the damaged file for recovery and start with an empty list.
    await rename(indexPath, `${indexPath}.invalid`);
    return [];
  }
}

function ensureJvm(
  jvmDir: string,
  report: (message: string) => void,
  signal: AbortSignal,
): Effect.Effect<void, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      signal.throwIfAborted();
      if (
        yield* preparationStep(() =>
          exists(
            path.join(getJavaHomeDir(jvmDir), "bin", getJavaExecutableName()),
          ),
        )
      ) {
        report("JVM detected");
        return undefined;
      }
      const jvmUrl = `https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=${detectArchitecture()}&image_type=jre&os=${detectOs()}&vendor=eclipse`;
      report("Fetching JVM data...");
      const metadata = yield* preparationStep(async () => {
        const data = await fetchMetadata(
          jvmUrl,
          signal,
          "Failed to fetch JVM metadata",
        );
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Adoptium API response is checked for the fields used below
        return data as {
          binary?: { package?: { checksum?: string; link?: string } };
          release_name?: string;
        }[];
      });
      const release = metadata[0];
      const checksum = release?.binary?.package?.checksum;
      const downloadUrl = release?.binary?.package?.link;
      const releaseName = release?.release_name;
      if (!checksum || !downloadUrl || !releaseName)
        return yield* IntegratedServerError.make({
          message: "JVM metadata was incomplete",
        });

      const archiveTmpPath = `${jvmDir}.download`;
      const extractTmpRoot = `${jvmDir}.extract`;
      yield* temporaryPath(archiveTmpPath);
      yield* temporaryPath(extractTmpRoot, true);
      yield* downloadToFileEffect(
        downloadUrl,
        archiveTmpPath,
        signal,
        (percent) => {
          report(`Downloading JVM... ${percent}%`);
        },
      );
      yield* preparationStep(() =>
        verifyFileChecksum(archiveTmpPath, checksum, "JVM", signal),
      );
      signal.throwIfAborted();
      report("Extracting JVM...");
      yield* preparationStep(() => mkdir(extractTmpRoot, { recursive: true }));
      if (downloadUrl.endsWith(".zip")) {
        // Read the archive without blocking the main process. adm-zip
        // inflates entries asynchronously.
        yield* preparationStep(async () =>
          new AdmZip(await readFile(archiveTmpPath)).extractAllToAsync(
            extractTmpRoot,
            true,
          ),
        );
      } else if (downloadUrl.endsWith(".tar.gz")) {
        yield* preparationStep(() =>
          tar.x({ cwd: extractTmpRoot, file: archiveTmpPath }),
        );
      } else {
        return yield* IntegratedServerError.make({
          message: "Unsupported JVM archive type",
        });
      }
      const extractedJvmDir = path.join(extractTmpRoot, `${releaseName}-jre`);
      const extractedJavaExec = path.join(
        getJavaHomeDir(extractedJvmDir),
        "bin",
        getJavaExecutableName(),
      );
      if (!(yield* preparationStep(() => exists(extractedJavaExec))))
        return yield* IntegratedServerError.make({
          message: "Extracted JVM is missing the Java executable",
        });
      signal.throwIfAborted();
      yield* preparationStep(() =>
        atomicReplaceDirectory(extractedJvmDir, jvmDir),
      );
      signal.throwIfAborted();
      report("Downloaded JVM");
      return undefined;
    }),
  );
}

function ensureSoulFireJar(
  version: string,
  jarName: string,
  jarPath: string,
  report: (message: string) => void,
  signal: AbortSignal,
): Effect.Effect<void, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      const checksumPath = `${jarPath}.sha256`;
      // A checksum saved after an earlier verified download lets SoulFire
      // start offline and without a GitHub API request.
      const existingChecksum = (yield* preparationStep(() => exists(jarPath)))
        ? yield* preparationStep(() => sha256FileHex(jarPath, signal))
        : null;
      const savedChecksum = yield* preparationStep(() =>
        readFile(checksumPath, "utf8").then(
          (value) => value.trim().toLowerCase(),
          () => null,
        ),
      );
      if (existingChecksum !== null && existingChecksum === savedChecksum) {
        report("SoulFire already downloaded and verified");
        return;
      }
      report("Fetching SoulFire checksum metadata...");
      const expectedChecksum = (yield* preparationStep(() =>
        fetchSoulFireJarChecksum(version, jarName, signal),
      )).toLowerCase();
      if (existingChecksum === expectedChecksum) {
        yield* preparationStep(() => writeFile(checksumPath, expectedChecksum));
        report("SoulFire already downloaded and verified");
        return;
      }
      const jarUrl = `https://github.com/soulfiremc-com/SoulFire/releases/download/${version}/${jarName}`;
      const tempJarPath = `${jarPath}.download`;
      yield* temporaryPath(tempJarPath);
      report("Fetching SoulFire data...");
      yield* downloadToFileEffect(jarUrl, tempJarPath, signal, (percent) => {
        report(`Downloading SoulFire... ${percent}%`);
      });
      yield* preparationStep(() =>
        verifyFileChecksum(
          tempJarPath,
          expectedChecksum,
          "SoulFire jar",
          signal,
        ),
      );
      signal.throwIfAborted();
      // The download sits next to the jar, so the rename replaces it atomically.
      yield* preparationStep(() => rename(tempJarPath, jarPath));
      yield* preparationStep(() => writeFile(checksumPath, expectedChecksum));
      report("Downloaded SoulFire");
    }),
  );
}

async function fetchSoulFireJarChecksum(
  version: string,
  jarName: string,
  signal: AbortSignal,
): Promise<string> {
  const data = await fetchMetadata(
    `https://api.github.com/repos/soulfiremc-com/SoulFire/releases/tags/${version}`,
    signal,
    "Failed to fetch SoulFire release metadata",
    { "User-Agent": "SoulFireClient" },
  );

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the GitHub release response is checked for the fields used below
  const release = data as {
    assets?: {
      name?: string;
      digest?: string;
    }[];
  };
  const asset = release.assets?.find((entry) => entry.name === jarName);
  const digest = asset?.digest?.replace(/^sha256:/u, "");
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
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve();
    });
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

function createRootApiToken(secretKey: Buffer): string {
  const issuedAt = Math.floor(
    DateTime.toEpochMillis(DateTime.nowUnsafe()) / 1000,
  );
  const header = base64urlEncode(
    encodeJson({
      alg: "HS256",
      typ: "JWT",
    }),
  );
  const claims = base64urlEncode(
    encodeJson({
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
    case "x64": {
      return "x64";
    }
    case "ia32": {
      return "x32";
    }
    case "ppc64": {
      return "ppc64";
    }
    case "s390x": {
      return "s390x";
    }
    case "arm64": {
      return "aarch64";
    }
    case "arm": {
      return "arm";
    }
    case "riscv64": {
      return "riscv64";
    }
    case "loong64":
    case "mips":
    case "mipsel":
    default: {
      return "unknown";
    }
  }
}

function detectOs(): string {
  switch (process.platform) {
    case "linux": {
      return "linux";
    }
    case "win32": {
      return "windows";
    }
    case "darwin": {
      return "mac";
    }
    case "aix":
    case "android":
    case "cygwin":
    case "freebsd":
    case "haiku":
    case "netbsd":
    case "openbsd":
    case "sunos":
    default: {
      return "unknown";
    }
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

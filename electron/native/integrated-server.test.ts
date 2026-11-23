import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { App } from "electron";
import {
  importCustomSoulFireServerJar,
  integratedServerEnvironment,
  listCustomSoulFireServerJars,
  removeCustomSoulFireServerJar,
  runIntegratedServer,
} from "./integrated-server";
import { createIntegratedServerState } from "./integrated-server-process";

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

test("failed JVM extraction removes its archive and directory before startup is released", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "soulfire-preparation-"),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const archive = Buffer.from("invalid zip archive");
  let downloads = 0;
  globalThis.fetch = async (input) => {
    if (requestUrl(input).startsWith("https://api.adoptium.net/"))
      return Response.json([
        {
          binary: {
            package: {
              checksum: createHash("sha256").update(archive).digest("hex"),
              link: "https://example.test/jvm.zip",
            },
          },
          release_name: "test-jvm",
        },
      ]);
    assert.equal(requestUrl(input), "https://example.test/jvm.zip");
    downloads++;
    return new Response(archive);
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
  const app = {
    getAppPath: () => directory,
    getPath: () => directory,
  } as unknown as App;
  const state = createIntegratedServerState();
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(
      runIntegratedServer(app, state, [], { type: "official" }, "2.11.0"),
    );
    for (const suffix of [".download", ".extract"])
      assert.equal(
        await stat(path.join(directory, "local-data", `jvm-25${suffix}`)).catch(
          () => null,
        ),
        null,
      );
    assert.equal(state.startup, null);
    assert.equal(state.child, null);
    assert.equal(state.diagnostics.status, "failed");
  }
  assert.equal(downloads, 2);
});

test(
  "a verified jar starts without fetching release metadata",
  { skip: process.platform === "win32" },
  async (context) => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "soulfire-offline-jar-"),
    );
    context.after(() => rm(directory, { recursive: true, force: true }));
    const originalFetch = globalThis.fetch;
    context.after(() => {
      globalThis.fetch = originalFetch;
    });
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      requests.push(requestUrl(input));
      throw new TypeError("Failed to fetch");
    };
    const localData = path.join(directory, "local-data");
    const javaHome =
      process.platform === "darwin"
        ? path.join(localData, "jvm-25", "Contents", "Home")
        : path.join(localData, "jvm-25");
    await mkdir(path.join(javaHome, "bin"), { recursive: true });
    // The fake Java exits at once, so startup fails after the jar check.
    await writeFile(path.join(javaHome, "bin", "java"), "#!/bin/sh\nexit 1\n", {
      mode: 0o755,
    });
    const jarPath = path.join(
      localData,
      "jars",
      "SoulFireDedicated-2.11.0.jar",
    );
    await mkdir(path.dirname(jarPath), { recursive: true });
    const jar = Buffer.from("verified jar");
    await writeFile(jarPath, jar);
    await writeFile(
      `${jarPath}.sha256`,
      createHash("sha256").update(jar).digest("hex"),
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
    const app = {
      getAppPath: () => directory,
      getPath: () => directory,
    } as unknown as App;
    const state = createIntegratedServerState();

    await assert.rejects(
      runIntegratedServer(app, state, [], { type: "official" }, "2.11.0"),
    );

    assert.deepEqual(requests, []);
    assert.ok(
      state.diagnostics.logs.some(
        (log) => log.message === "SoulFire already downloaded and verified",
      ),
    );
  },
);

test("a custom jar ID that is not a hash cannot choose the data directory", async () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
  const app = {
    getAppPath: () => os.tmpdir(),
    getPath: () => os.tmpdir(),
  } as unknown as App;
  const state = createIntegratedServerState();

  await assert.rejects(
    runIntegratedServer(
      app,
      state,
      [],
      { type: "custom", jarId: "../../../../outside" },
      "2.11.0",
    ),
    /no longer available/u,
  );
  assert.equal(state.diagnostics.dataDirectory, "");
});

test("the Java library path never includes the working directory", () => {
  const javaHome = path.join("/opt", "java");
  const lib = path.join(javaHome, "lib");
  const server = path.join(javaHome, "lib", "server");
  const withoutParent = integratedServerEnvironment(javaHome, {});
  assert.equal(
    withoutParent.LD_LIBRARY_PATH,
    [lib, server].join(path.delimiter),
  );
  const withParent = integratedServerEnvironment(javaHome, {
    DYLD_LIBRARY_PATH: `${path.delimiter}/usr/lib${path.delimiter}`,
  });
  assert.equal(
    withParent.DYLD_LIBRARY_PATH,
    [lib, server, "/usr/lib"].join(path.delimiter),
  );
});

const require = createRequire(__filename);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- adm-zip is loaded with require so its types are declared here
const AdmZip = require("adm-zip") as new () => {
  addFile: (name: string, content: Buffer) => void;
  toBuffer: () => Buffer;
};

function serverJar(marker: string): Buffer {
  const archive = new AdmZip();
  archive.addFile("META-INF/MANIFEST.MF", Buffer.from("Manifest-Version: 1.0"));
  archive.addFile("marker.txt", Buffer.from(marker));
  return archive.toBuffer();
}

async function customJarFixture(context: {
  after: (fn: () => unknown) => void;
}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "soulfire-custom-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
  const app = {
    getAppPath: () => directory,
    getPath: () => directory,
  } as unknown as App;
  return {
    app,
    directory,
    customJarsDir: path.join(directory, "local-data", "custom-jars"),
  };
}

test("parallel custom jar imports are all kept in the index", async (context) => {
  const { app, directory, customJarsDir } = await customJarFixture(context);
  const sources = await Promise.all(
    ["a", "b", "c", "d"].map(async (name) => {
      const source = path.join(directory, `${name}.jar`);
      await writeFile(source, serverJar(name));
      return source;
    }),
  );

  const imported = await Promise.all(
    sources.map((source) => importCustomSoulFireServerJar(app, source)),
  );

  const listed = await listCustomSoulFireServerJars(app);
  assert.deepEqual(
    listed.map((jar) => jar.id).toSorted(),
    imported.map((jar) => jar.id).toSorted(),
  );
  // Only the stored jars and the index remain, without temporary files.
  assert.deepEqual(
    (await readdir(customJarsDir)).toSorted(),
    [...imported.map((jar) => `${jar.id}.jar`), "index.json"].toSorted(),
  );
});

test("importing replaces a damaged stored copy and rejects files without a manifest", async (context) => {
  const { app, directory, customJarsDir } = await customJarFixture(context);
  const source = path.join(directory, "server.jar");
  const contents = serverJar("server");
  await writeFile(source, contents);
  const id = createHash("sha256").update(contents).digest("hex");
  await mkdir(customJarsDir, { recursive: true });
  await writeFile(path.join(customJarsDir, `${id}.jar`), "truncated");

  const jar = await importCustomSoulFireServerJar(app, source);

  assert.equal(jar.id, id);
  assert.deepEqual(await readFile(jar.path), contents);

  const invalid = path.join(directory, "invalid.jar");
  await writeFile(invalid, "not a zip archive");
  await assert.rejects(
    importCustomSoulFireServerJar(app, invalid),
    /not a valid jar/u,
  );
  assert.deepEqual((await readdir(customJarsDir)).toSorted(), [
    `${id}.jar`,
    "index.json",
  ]);
});

test("a damaged index is moved aside and removal cannot delete other files", async (context) => {
  const { app, directory, customJarsDir } = await customJarFixture(context);
  await mkdir(customJarsDir, { recursive: true });
  const indexPath = path.join(customJarsDir, "index.json");
  await writeFile(indexPath, "{ broken");

  assert.deepEqual(await listCustomSoulFireServerJars(app), []);
  assert.equal(await readFile(`${indexPath}.invalid`, "utf8"), "{ broken");

  const outside = path.join(directory, "outside.txt");
  await writeFile(outside, "keep");
  const id = "a".repeat(64);
  await writeFile(
    indexPath,
    JSON.stringify({
      jars: [
        {
          id,
          importedAt: "2026-01-01T00:00:00.000Z",
          originalName: "server.jar",
          path: outside,
          sha256: id,
          size: 4,
        },
      ],
    }),
  );
  await writeFile(path.join(customJarsDir, `${id}.jar`), "jar");

  const [listed] = await listCustomSoulFireServerJars(app);
  assert.equal(listed?.path, path.join(customJarsDir, `${id}.jar`));
  await removeCustomSoulFireServerJar(app, id);
  assert.equal(await readFile(outside, "utf8"), "keep");
  assert.deepEqual(await listCustomSoulFireServerJars(app), []);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { App } from "electron";
import {
  integratedServerEnvironment,
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

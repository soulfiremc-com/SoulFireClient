import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { App } from "electron";
import { runIntegratedServer } from "./integrated-server";
import { createIntegratedServerState } from "./integrated-server-process";

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
    if (String(input).startsWith("https://api.adoptium.net/"))
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
    assert.equal(String(input), "https://example.test/jvm.zip");
    downloads++;
    return new Response(archive);
  };
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

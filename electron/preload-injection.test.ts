import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { build } from "vite";

const repoRoot = path.dirname(import.meta.dirname);

test(
  "Electron preload bundle exposes the explicit bridge and no legacy desktop RPC bus",
  { timeout: 60_000 },
  async (t) => {
    // Bundle only the preload entry. A full app build is slow and would
    // overwrite the dist folders.
    const outDir = await mkdtemp(path.join(tmpdir(), "soulfire-preload-"));
    t.after(() => rm(outDir, { recursive: true, force: true }));
    await build({
      configFile: false,
      root: repoRoot,
      logLevel: "silent",
      build: {
        outDir,
        emptyOutDir: false,
        minify: false,
        lib: {
          entry: path.join(repoRoot, "electron/preload.ts"),
          formats: ["es"],
          fileName: () => "preload.mjs",
        },
        rolldownOptions: { external: ["electron"] },
      },
    });

    const preloadBundle = await readFile(
      path.join(outDir, "preload.mjs"),
      "utf8",
    );

    assert.match(preloadBundle, /soulfireElectron/u);
    assert.doesNotMatch(preloadBundle, /desktop:call/u);
    assert.doesNotMatch(preloadBundle, /desktop:emit/u);
    assert.doesNotMatch(preloadBundle, /sendSync\(/u);
  },
);

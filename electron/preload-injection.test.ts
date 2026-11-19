import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const electronDir = import.meta.dirname;
const repoRoot = path.dirname(electronDir);

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stderr, stdout });
    });
  });
}

test(
  "Electron preload bundle exposes the explicit bridge and no legacy desktop RPC bus",
  {
    timeout: 120_000,
  },
  async () => {
    const build = await runCommand("bunx", ["vite", "build"], {
      env: {
        ...process.env,
        SF_ELECTRON: "1",
      },
    });

    assert.equal(build.code, 0, build.stderr || build.stdout);

    const preloadBundle = await readFile(
      path.join(repoRoot, "dist-electron", "preload.mjs"),
      "utf8",
    );

    assert.match(preloadBundle, /soulfireElectron/u);
    assert.doesNotMatch(preloadBundle, /desktop:call/u);
    assert.doesNotMatch(preloadBundle, /desktop:emit/u);
    assert.doesNotMatch(preloadBundle, /sendSync\(/u);
  },
);

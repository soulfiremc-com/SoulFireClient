import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const project = fileURLToPath(new URL("../", import.meta.url));
const installer = join(project, "scripts/install-hooks.mjs");
const env = {
  ...process.env,
  PATH: `${join(project, "node_modules/.bin")}${delimiter}${process.env.PATH}`,
};
function run(cwd, command, args) {
  return spawnSync(command, args, { cwd, env, encoding: "utf8" });
}
function git(cwd, ...args) {
  const result = run(cwd, "git", args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "lefthook-migration-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "init", "--initial-branch=main");
  git(cwd, "config", "user.name", "Hook Test");
  git(cwd, "config", "user.email", "hook-test@example.invalid");
  git(cwd, "config", "commit.gpgsign", "false");
  cpSync(join(project, "lefthook.yml"), join(cwd, "lefthook.yml"));
  for (const config of ["biome.json", ".oxlintrc.json", ".oxfmtrc.json"]) {
    try {
      cpSync(join(project, config), join(cwd, config));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  symlinkSync(join(project, "node_modules"), join(cwd, "node_modules"), "dir");
  writeFileSync(join(cwd, ".gitignore"), "node_modules/\n");
  mkdirSync(join(cwd, "src"));
  return cwd;
}

test("dependency preparation migrates the legacy Husky hook path", (t) => {
  const cwd = fixture(t);
  git(cwd, "config", "core.hooksPath", ".husky/_");
  const result = run(cwd, "node", [installer]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    run(cwd, "git", ["config", "--local", "--get", "core.hooksPath"]).status,
    1,
  );
  assert.match(
    readFileSync(join(cwd, ".git/hooks/pre-commit"), "utf8"),
    /lefthook/,
  );
});

test("dependency preparation preserves a custom hook path", (t) => {
  const cwd = fixture(t);
  git(cwd, "config", "core.hooksPath", "custom-hooks");
  run(cwd, "node", [installer]);
  assert.equal(git(cwd, "config", "--get", "core.hooksPath"), "custom-hooks");
});

test("a real commit formats a spaced filename and preserves its unstaged changes", (t) => {
  const cwd = fixture(t);
  const file = join(cwd, "src/hook sample.ts");
  writeFileSync(file, "export const first = 0;\n\nexport const second = 0;\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "test: add hook fixture");
  const installed = run(cwd, "node", [installer]);
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  writeFileSync(file, "export const first=1;\n\nexport const second = 0;\n");
  git(cwd, "add", "src/hook sample.ts");
  writeFileSync(file, "export const first=1;\n\nexport const second = 2;\n");
  git(cwd, "commit", "-m", "test: format staged changes");
  const committed = git(cwd, "show", "HEAD:src/hook sample.ts");
  assert.match(committed, /first = 1/);
  assert.match(committed, /second = 0/);
  assert.match(readFileSync(file, "utf8"), /second = 2/);
  assert.match(git(cwd, "diff", "--", "src/hook sample.ts"), /second = 2/);
});

test("a real commit rejects invalid staged syntax", (t) => {
  const cwd = fixture(t);
  const installed = run(cwd, "node", [installer]);
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  writeFileSync(join(cwd, "src/broken.ts"), "export const broken = ;\n");
  git(cwd, "add", ".");
  const result = run(cwd, "git", [
    "commit",
    "-m",
    "test: reject invalid syntax",
  ]);
  assert.notEqual(result.status, 0);
  assert.notEqual(run(cwd, "git", ["rev-parse", "--verify", "HEAD"]).status, 0);
});

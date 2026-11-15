import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./prepare-crowdin-upload.mjs", import.meta.url),
);

function prepare(t, files) {
  const root = mkdtempSync(join(tmpdir(), "crowdin-upload-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = join(root, "repository");
  const destination = join(root, "upload");
  for (const [path, contents] of Object.entries({
    "locales/en-US/common.json": '{"greeting":"Hello"}',
    "locales/en-US/script.editor.json": '{"title":"Editor"}',
    "locales/de-DE/common.json": '{"greeting":"Hallo"}',
    "locales/fr-FR/common.json": '{"greeting":"Bonjour"}',
    "locales/ja-JP/script.editor.json": '{"title":"エディター"}',
    "locales/de-DE/unknown.json": '{"unknown":"Unbekannt"}',
    "README.md": "Documentation",
  })) {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  const filesPath = join(root, "files.json");
  writeFileSync(filesPath, JSON.stringify(files));
  const result = spawnSync(
    process.execPath,
    [script, repository, filesPath, destination],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return { destination, output: result.stdout.trim() };
}

test("stages source files and changed translations across paginated PR files", (t) => {
  const { destination, output } = prepare(t, [
    [
      { filename: "locales/de-DE/common.json", status: "modified" },
      { filename: "locales/en-US/common.json", status: "modified" },
      { filename: "README.md", status: "modified" },
    ],
    [
      { filename: "locales/ja-JP/script.editor.json", status: "renamed" },
      { filename: "locales/de-DE/unknown.json", status: "added" },
      { filename: "locales/it-IT/common.json", status: "modified" },
      { filename: "locales/fr-FR/common.json", status: "removed" },
    ],
  ]);

  assert.equal(output, "has_translations=true");
  assert.deepEqual(readdirSync(join(destination, "locales")), [
    "de-DE",
    "en-US",
    "ja-JP",
  ]);
  assert.deepEqual(readdirSync(join(destination, "locales/de-DE")), [
    "common.json",
  ]);
  assert.deepEqual(readdirSync(join(destination, "locales/en-US")), [
    "common.json",
    "script.editor.json",
  ]);
  assert.equal(
    readFileSync(join(destination, "locales/de-DE/common.json"), "utf8"),
    '{"greeting":"Hallo"}',
  );
  assert.equal(
    readFileSync(join(destination, "locales/ja-JP/script.editor.json"), "utf8"),
    '{"title":"エディター"}',
  );
});

test("source-only edits do not stage unrelated translations", (t) => {
  const { destination, output } = prepare(t, [
    [{ filename: "locales/en-US/common.json", status: "modified" }],
  ]);

  assert.equal(output, "has_translations=false");
  assert.deepEqual(readdirSync(join(destination, "locales")), ["en-US"]);
});

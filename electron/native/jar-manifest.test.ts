import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { hasJarManifest } from "./jar-manifest";

const require = createRequire(__filename);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- adm-zip is loaded with require so its types are declared here
const AdmZip = require("adm-zip") as new () => {
  addFile: (name: string, content: Buffer) => void;
  addZipComment: (comment: string) => void;
  toBuffer: () => Buffer;
};

function zip(entries: string[], comment?: string): Buffer {
  const archive = new AdmZip();
  for (const entry of entries) archive.addFile(entry, Buffer.from(entry));
  if (comment !== undefined) archive.addZipComment(comment);
  return archive.toBuffer();
}

test("jar manifest check reads the zip central directory", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "soulfire-jar-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const cases: [string, Buffer, boolean][] = [
    [
      "manifest.jar",
      zip(["com/example/Main.class", "META-INF/MANIFEST.MF"]),
      true,
    ],
    ["commented.jar", zip(["meta-inf/manifest.mf"], "x".repeat(1000)), true],
    ["missing.jar", zip(["com/example/Main.class"]), false],
    ["text.jar", Buffer.from("not a zip archive"), false],
    ["empty.jar", Buffer.alloc(0), false],
  ];
  for (const [name, contents, expected] of cases) {
    const filePath = path.join(directory, name);
    await writeFile(filePath, contents);
    assert.equal(await hasJarManifest(filePath), expected, name);
  }
});

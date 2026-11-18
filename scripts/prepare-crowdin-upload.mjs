import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const [repository, filesPath, destination] = process.argv.slice(2);
const sourceDirectory = join(repository, "locales/en-US");
const uploadDirectory = resolve(destination);
const files = JSON.parse(readFileSync(filesPath, "utf8")).flat();

mkdirSync(join(uploadDirectory, "locales"), { recursive: true });
cpSync(sourceDirectory, join(uploadDirectory, "locales/en-US"), {
  recursive: true,
});

let translations = 0;
for (const { filename, status } of files) {
  if (
    status === "removed" ||
    !/^locales\/(?!en-US\/|\.\.?\/)[^/]+\/[^/]+\.json$/.test(filename) ||
    !existsSync(join(sourceDirectory, basename(filename))) ||
    !existsSync(join(repository, filename))
  ) {
    continue;
  }

  const target = join(uploadDirectory, filename);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(repository, filename), target);
  translations += 1;
}

process.stdout.write(`has_translations=${translations > 0}\n`);

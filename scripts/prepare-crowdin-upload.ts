import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

// The Crowdin upload workflow runs this file without installing dependencies,
// so it checks the GitHub API response by hand instead of with Effect Schema.
interface PullRequestFile {
  filename: string;
  status: string;
}

function isPullRequestFile(value: unknown): value is PullRequestFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "filename" in value &&
    typeof value.filename === "string" &&
    "status" in value &&
    typeof value.status === "string"
  );
}

const [repository, filesPath, destination] = process.argv.slice(2);
if (
  repository === undefined ||
  filesPath === undefined ||
  destination === undefined
) {
  throw new TypeError(
    "Usage: prepare-crowdin-upload.ts <repository> <files.json> <destination>",
  );
}
const sourceDirectory = join(repository, "locales/en-US");
const uploadDirectory = resolve(destination);
// `gh api --paginate --slurp` returns one array per page.
const pages: unknown = JSON.parse(readFileSync(filesPath, "utf8"));
const files: unknown[] = Array.isArray(pages) ? pages.flat() : [];
if (!Array.isArray(pages) || !files.every((file) => isPullRequestFile(file))) {
  throw new TypeError(`Invalid pull request file list in ${filesPath}`);
}

mkdirSync(join(uploadDirectory, "locales"), { recursive: true });
cpSync(sourceDirectory, join(uploadDirectory, "locales/en-US"), {
  recursive: true,
});

let translations = 0;
for (const { filename, status } of files) {
  if (
    status === "removed" ||
    !/^locales\/(?!en-US\/|\.\.?\/)[^/]+\/[^/]+\.json$/u.test(filename) ||
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

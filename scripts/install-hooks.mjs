import { spawnSync } from "node:child_process";

// Published archives do not need local Git hooks.
if (
  spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" }).status === 0
) {
  const hooksPath = spawnSync(
    "git",
    ["config", "--local", "--get", "core.hooksPath"],
    {
      encoding: "utf8",
    },
  ).stdout?.trim();

  // Remove only Husky's known paths. Lefthook reports other custom paths itself.
  if (hooksPath === ".husky" || hooksPath === ".husky/_") {
    const result = spawnSync(
      "git",
      ["config", "--local", "--unset-all", "core.hooksPath"],
      {
        stdio: "inherit",
      },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  const result = spawnSync("lefthook", ["install"], { stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

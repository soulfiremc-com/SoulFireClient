import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import chokidar, { type FSWatcher } from "chokidar";

function event(watcher: FSWatcher, name: string, target: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.off("all", listener);
      reject(new Error(`Missing ${name} event for ${target}`));
    }, 5_000);
    const listener = (kind: string, changed: string) => {
      if (kind !== name || changed !== target) return;
      clearTimeout(timeout);
      watcher.off("all", listener);
      resolve();
    };
    watcher.on("all", listener);
  });
}

test("desktop file watching reports create, edit, rename and deletion and releases handles", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sf-watch-"));
  const original = path.join(directory, "original.txt");
  await writeFile(original, "initial");
  const watcher = chokidar.watch(directory, {
    depth: 0,
    ignoreInitial: true,
    persistent: true,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      watcher.once("ready", resolve);
      watcher.once("error", reject);
    });
    let observed = event(watcher, "change", original);
    await writeFile(original, "updated content");
    await observed;
    const created = path.join(directory, "created.txt");
    observed = event(watcher, "add", created);
    await writeFile(created, "new file");
    await observed;
    const renamed = path.join(directory, "renamed.txt");
    const renamedEvents = Promise.all([
      event(watcher, "unlink", original),
      event(watcher, "add", renamed),
    ]);
    await rename(original, renamed);
    await renamedEvents;
    observed = event(watcher, "unlink", renamed);
    await rm(renamed);
    await observed;
    await watcher.close();
    assert.deepEqual(Object.keys(watcher.getWatched()), []);
    let lateEvents = 0;
    watcher.on("all", () => lateEvents++);
    await writeFile(original, "after closing");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(lateEvents, 0);
  } finally {
    await watcher.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("recursive desktop watching includes nested files while depth zero excludes them", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sf-watch-"));
  const nested = path.join(directory, "nested");
  await mkdir(nested);
  const recursive = chokidar.watch(directory, {
    ignoreInitial: true,
    persistent: true,
  });
  const shallow = chokidar.watch(directory, {
    depth: 0,
    ignoreInitial: true,
    persistent: true,
  });
  try {
    await Promise.all(
      [recursive, shallow].map(
        (watcher) =>
          new Promise<void>((resolve, reject) => {
            watcher.once("ready", resolve);
            watcher.once("error", reject);
          }),
      ),
    );
    const target = path.join(nested, "nested.txt");
    const shallowPaths: string[] = [];
    shallow.on("all", (_kind, changed) => shallowPaths.push(changed));
    const observed = event(recursive, "add", target);
    await writeFile(target, "nested content");
    await observed;
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(shallowPaths.includes(target), false);
  } finally {
    await Promise.all([recursive.close(), shallow.close()]);
    await rm(directory, { recursive: true, force: true });
  }
});

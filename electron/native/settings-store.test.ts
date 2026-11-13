import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import Store from "electron-store";

const defaults = {
  window: { height: 675, isMaximized: false, width: 1200 },
};

test("window settings preserve legacy values and survive write and reopen", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "sf-settings-"));
  try {
    const legacy = { window: { height: 768, isMaximized: true, width: 1024 } };
    await writeFile(
      path.join(cwd, "window-state.json"),
      JSON.stringify(legacy),
    );
    const store = new Store({ cwd, name: "window-state", defaults });
    assert.deepEqual(store.get("window"), legacy.window);
    const updated = { height: 900, isMaximized: false, width: 1440 };
    store.set("window", updated);
    const reopened = new Store({ cwd, name: "window-state", defaults });
    assert.deepEqual(reopened.get("window"), updated);
    assert.deepEqual(
      JSON.parse(await readFile(store.path, "utf8")).window,
      updated,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a new settings file gets defaults and malformed data is not overwritten", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "sf-settings-"));
  try {
    const store = new Store({ cwd, name: "window-state", defaults });
    assert.deepEqual(store.get("window"), defaults.window);
    await writeFile(store.path, "{invalid");
    assert.throws(
      () => new Store({ cwd, name: "window-state", defaults }),
      SyntaxError,
    );
    assert.equal(await readFile(store.path, "utf8"), "{invalid");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

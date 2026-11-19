import assert from "node:assert/strict";
import { test } from "node:test";
import { copyMinecraftText } from "./minecraft-client-actions";

function browser(clipboard?: { writeText: (text: string) => Promise<void> }) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
  return { navigator: { clipboard } } as unknown as Window;
}

test("native copy forwards text to the requested browser window", async () => {
  const value = crypto.randomUUID();
  const copied: string[] = [];
  const win = browser({
    writeText: async (text) => {
      copied.push(text);
    },
  });
  await copyMinecraftText(value, win);
  assert.deepEqual(copied, [value]);
});

test("an unavailable clipboard cannot fail a completed Minecraft action", async () => {
  await assert.doesNotReject(async () => {
    await copyMinecraftText(crypto.randomUUID(), browser());
  });
});

test("a clipboard method that throws synchronously cannot fail a completed action", async () => {
  const win = browser({
    writeText: () => {
      throw new Error("Test failure");
    },
  });
  await assert.doesNotReject(async () => {
    await copyMinecraftText(crypto.randomUUID(), win);
  });
});

test("an asynchronous clipboard denial remains handled", async () => {
  const win = browser({
    writeText: async () => {
      throw new Error("Test failure");
    },
  });
  await assert.doesNotReject(async () => {
    await copyMinecraftText(crypto.randomUUID(), win);
  });
});

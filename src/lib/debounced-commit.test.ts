import assert from "node:assert/strict";
import { test } from "node:test";
import { DebouncedCommit, flushWhenPageHides } from "./debounced-commit";

const wait = async (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

test("rapid edits commit only the latest value after the pause", async () => {
  const commits: string[] = [];
  const saver = new DebouncedCommit<string>(20);
  for (const value of ["m", "mc", "mc.example"]) {
    saver.schedule(value, (next) => {
      commits.push(next);
    });
  }
  assert.deepEqual(commits, []);
  await wait(40);
  assert.deepEqual(commits, ["mc.example"]);
});

test("flush commits a held edit at once and only once", async () => {
  const commits: number[] = [];
  const saver = new DebouncedCommit<number>(20);
  saver.schedule(35, (next) => {
    commits.push(next);
  });
  saver.flush();
  saver.flush();
  await wait(40);
  assert.deepEqual(commits, [35]);
});

test("cancel drops a held edit", async () => {
  const commits: number[] = [];
  const saver = new DebouncedCommit<number>(20);
  saver.schedule(3, (next) => {
    commits.push(next);
  });
  saver.cancel();
  saver.flush();
  await wait(40);
  assert.deepEqual(commits, []);
});

const visibleState = (): { visibilityState: DocumentVisibilityState } => ({
  visibilityState: "visible",
});

test("hiding the page commits a held edit before the pause ends", () => {
  const commits: string[] = [];
  const saver = new DebouncedCommit<string>(10_000);
  const page = new EventTarget();
  const doc = Object.assign(new EventTarget(), visibleState());
  const cleanup = flushWhenPageHides(saver, doc, page);
  saver.schedule("mc.example", (next) => {
    commits.push(next);
  });
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(commits.slice(), []);
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(commits.slice(), ["mc.example"]);
  saver.schedule("play.example", (next) => {
    commits.push(next);
  });
  page.dispatchEvent(new Event("pagehide"));
  assert.deepEqual(commits.slice(), ["mc.example", "play.example"]);
  cleanup();
  saver.schedule("late.example", (next) => {
    commits.push(next);
  });
  page.dispatchEvent(new Event("pagehide"));
  saver.cancel();
  assert.deepEqual(commits.slice(), ["mc.example", "play.example"]);
});

test("cleanup commits a held edit, as on unmount", () => {
  const commits: number[] = [];
  const saver = new DebouncedCommit<number>(10_000);
  const cleanup = flushWhenPageHides(
    saver,
    Object.assign(new EventTarget(), visibleState()),
    new EventTarget(),
  );
  saver.schedule(25_565, (next) => {
    commits.push(next);
  });
  cleanup();
  assert.deepEqual(commits.slice(), [25_565]);
});

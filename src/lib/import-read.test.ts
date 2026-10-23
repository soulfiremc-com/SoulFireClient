import assert from "node:assert/strict";
import { test } from "node:test";
import { ImportReadSession } from "./import-read";

function deferred() {
  let resolve!: (value: string[]) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string[]>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("dismissal cancels pending reads and ignores late results and failures", async () => {
  const session = new ImportReadSession();
  const accepted: string[] = [];
  for (const fail of [false, true]) {
    const read = deferred();
    let signal!: AbortSignal;
    const pending = session.run(
      (current) => {
        signal = current;
        return read.promise;
      },
      (texts) => accepted.push(...texts),
    );
    session.cancel();
    assert.equal(signal.aborted, true);
    if (fail) read.reject(new Error());
    else read.resolve(["late"]);
    await pending;
  }
  assert.deepEqual(accepted, []);
});

test("an old read cannot clear or deliver over a newer pending read", async () => {
  const session = new ImportReadSession();
  const accepted: string[] = [];
  const old = deferred();
  const latest = deferred();
  const pendingOld = session.run(
    () => old.promise,
    (texts) => accepted.push(...texts),
  );
  let latestSignal!: AbortSignal;
  const pendingLatest = session.run(
    (signal) => {
      latestSignal = signal;
      return latest.promise;
    },
    (texts) => accepted.push(...texts),
  );
  old.resolve(["old"]);
  await pendingOld;
  assert.equal(latestSignal.aborted, false);
  session.cancel();
  assert.equal(latestSignal.aborted, true);
  latest.resolve(["latest"]);
  await pendingLatest;
  assert.deepEqual(accepted, []);
});

test("a batch is accepted once in order before its listener closes the dialog", async () => {
  const session = new ImportReadSession();
  const accepted: (readonly string[])[] = [];
  const texts = ["first", "second", "third"];
  await session.run(
    async () => texts,
    (batch) => {
      accepted.push(batch);
      session.cancel();
    },
  );
  assert.deepEqual(accepted, [texts]);
});

test("a failed batch imports nothing, aborts remaining reads, and allows retry", async () => {
  const session = new ImportReadSession();
  const failure = new Error();
  const accepted: string[] = [];
  let signal!: AbortSignal;
  await assert.rejects(
    session.run(
      (current) => {
        signal = current;
        return Promise.all([Promise.resolve("ready"), Promise.reject(failure)]);
      },
      (texts) => accepted.push(...texts),
    ),
    (error) => error === failure,
  );
  assert.equal(signal.aborted, true);
  assert.equal(accepted.length, 0);
  await session.run(
    async () => ["retry"],
    (texts) => accepted.push(...texts),
  );
  assert.deepEqual(accepted, ["retry"]);
});

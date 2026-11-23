import { expect, mock, test } from "bun:test";
import type { DesktopIntegratedServerCredentials } from "@/lib/desktop-api";
import { createIntegratedStartup } from "./integrated-startup";

const credentials = { address: "http://127.0.0.1:38765", token: "jwt" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : error),
  );

function setup() {
  const run = deferred<DesktopIntegratedServerCredentials | null>();
  const kill = mock(() => Promise.resolve());
  const startup = createIntegratedStartup({ kill, run: () => run.promise });
  const onReady = mock(() => Promise.resolve());
  const onError = mock(() => {});
  return { run, kill, startup, onReady, onError };
}

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

test("a started server signs in with its credentials", async () => {
  const { run, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  await flush();
  run.resolve(credentials);
  await flush();
  expect(onReady).toHaveBeenCalledWith(credentials);
  expect(onError).not.toHaveBeenCalled();
});

test("a second start while one runs is ignored", async () => {
  const { run, kill, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  startup.start({ onReady, onError });
  run.resolve(credentials);
  await flush();
  expect(kill).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledTimes(1);
});

test("a server stopped elsewhere reports a failure", async () => {
  const { run, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  run.resolve(null);
  await flush();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onReady).not.toHaveBeenCalled();
});

test("cancelling drops a late result and allows a new start", async () => {
  const { run, kill, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  await flush();
  const cancelled = startup.cancel();
  run.resolve(credentials);
  await cancelled;
  expect(kill).toHaveBeenCalledTimes(2);
  expect(onReady).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();

  startup.start({ onReady, onError });
  await flush();
  expect(kill).toHaveBeenCalledTimes(3);
});

test("a failure after cancelling stays silent", async () => {
  const { run, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  await flush();
  const cancelled = startup.cancel();
  run.reject(new Error("process exited"));
  await cancelled;
  expect(onError).not.toHaveBeenCalled();
});

test("if the process cannot be stopped, the startup keeps reporting", async () => {
  const { run, kill, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  await flush();
  kill.mockImplementationOnce(() => Promise.reject(new Error("kill failed")));
  expect(await failure(startup.cancel())).toBe("kill failed");
  await flush();
  run.resolve(credentials);
  await flush();
  expect(onReady).toHaveBeenCalledWith(credentials);
});

test("if stopping fails after the startup ended, it reports a failure", async () => {
  const { run, kill, startup, onReady, onError } = setup();
  startup.start({ onReady, onError });
  await flush();
  let failKill!: (error: Error) => void;
  kill.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        failKill = reject;
      }),
  );
  const cancelled = startup.cancel();
  // The process exits on its own while the stop request is pending.
  run.reject(new Error("process exited"));
  await flush();
  failKill(new Error("kill failed"));
  expect(await failure(cancelled)).toBe("kill failed");
  await flush();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onReady).not.toHaveBeenCalled();
});

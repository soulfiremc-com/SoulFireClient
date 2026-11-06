import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Effect, Exit } from "effect";

export function downloadToFileEffect(
  url: string,
  destinationPath: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Effect.Effect<void, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (controller) => Effect.sync(() => controller.abort()),
      );
      const response = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: (runtimeSignal) =>
            fetch(url, {
              signal: AbortSignal.any([
                signal,
                controller.signal,
                runtimeSignal,
              ]),
            }),
          catch: (error) => error,
        }),
        (response) =>
          Effect.promise(async () => {
            if (response.body && !response.bodyUsed && !response.body.locked)
              await response.body.cancel();
          }),
        { interruptible: true },
      );
      if (!response.ok || response.body === null)
        return yield* Effect.fail(
          new Error(`Download failed (HTTP ${response.status}) for ${url}`),
        );
      const totalSize = Number(response.headers.get("content-length") ?? 0);
      let downloaded = 0;
      let lastPercent = -1;
      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          downloaded += chunk.length;
          if (totalSize > 0) {
            const percent = Math.floor((downloaded / totalSize) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              onProgress(percent);
            }
          }
          callback(null, chunk);
        },
      });
      // Wait for the aborted pipeline to close its file before cleanup removes it.
      const body = response.body;
      yield* Effect.callback<void, unknown>((resume, runtimeSignal) => {
        const pending = pipeline(
          Readable.from(body),
          progress,
          createWriteStream(destinationPath),
          {
            signal: AbortSignal.any([signal, controller.signal, runtimeSignal]),
          },
        );
        pending.then(
          () => resume(Effect.void),
          (error) => resume(Effect.fail(error)),
        );
        return Effect.gen(function* () {
          controller.abort();
          yield* Effect.promise(() =>
            pending.then(
              () => {},
              () => {},
            ),
          );
        });
      });
    }),
  ).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? Effect.promise(() => rm(destinationPath, { force: true }))
        : Effect.void,
    ),
  );
}

export function downloadToFile(
  url: string,
  destinationPath: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<void> {
  return Effect.runPromise(
    downloadToFileEffect(url, destinationPath, signal, onProgress),
    { signal },
  );
}

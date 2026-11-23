import { TaggedError as TaggedFailure } from "effect/Schema";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Schema, Effect } from "effect";

class DownloadError extends TaggedFailure<
  DownloadError,
  { readonly brand: unique symbol }
>()("DownloadError", {
  message: Schema.String,
}) {}

export function downloadToFileEffect(
  url: string,
  destinationPath: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  fetchDownload: typeof fetch = fetch,
): Effect.Effect<void, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (acquired) =>
          Effect.sync(() => {
            acquired.abort();
          }),
      );
      const response = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: (runtimeSignal) =>
            fetchDownload(url, {
              signal: AbortSignal.any([
                signal,
                controller.signal,
                runtimeSignal,
              ]),
            }),
          catch: (error) => error,
        }),
        (opened) =>
          Effect.promise(async () => {
            if (opened.body && !opened.bodyUsed && !opened.body.locked)
              await opened.body.cancel();
          }),
        { interruptible: true },
      );
      if (!response.ok || response.body === null)
        return yield* DownloadError.make({
          message: `Download failed (HTTP ${response.status}) for ${url}`,
        });
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
      yield* Effect.callback<undefined, unknown>((resume, runtimeSignal) => {
        const pending = pipeline(
          Readable.from(body),
          progress,
          createWriteStream(destinationPath),
          {
            signal: AbortSignal.any([signal, controller.signal, runtimeSignal]),
          },
        );
        pending.then(
          () => {
            resume(Effect.undefined);
          },
          (error: unknown) => {
            resume(Effect.fail(error));
          },
        );
        return Effect.gen(function* () {
          controller.abort();
          yield* Effect.promise(() =>
            pending.then(
              () => undefined,
              () => undefined,
            ),
          );
        });
      });
      return undefined;
    }),
  ).pipe(
    Effect.onError(() =>
      Effect.promise(() => rm(destinationPath, { force: true })),
    ),
  );
}

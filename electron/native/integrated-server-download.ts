import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function downloadToFile(
  url: string,
  destinationPath: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<void> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok || response.body === null) {
      await response.body?.cancel();
      throw new Error(`Download failed (HTTP ${response.status}) for ${url}`);
    }
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
    await pipeline(
      Readable.from(response.body),
      progress,
      createWriteStream(destinationPath),
      { signal },
    );
  } catch (error) {
    await rm(destinationPath, { force: true });
    throw error;
  }
}

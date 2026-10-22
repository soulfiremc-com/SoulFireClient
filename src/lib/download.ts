import type { DownloadResponse } from "@/generated/soulfire/download_pb";

export function createTextBlob(
  text: string,
  type = "text/plain;charset=utf-8",
) {
  return new Blob([text], { type });
}

export class DownloadHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`Download returned HTTP ${statusCode}`);
    this.name = "DownloadHttpError";
  }
}

export function decodeTextDownload(
  response: Pick<DownloadResponse, "statusCode" | "data">,
): string {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new DownloadHttpError(response.statusCode);
  }
  return new TextDecoder().decode(response.data);
}

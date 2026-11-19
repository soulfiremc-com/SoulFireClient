import { TaggedError as TaggedFailure } from "effect/Schema";
import { Schema } from "effect";
import type { DownloadResponse } from "@/generated/soulfire/download_pb";

export function createTextBlob(
  text: string,
  type = "text/plain;charset=utf-8",
) {
  return new Blob([text], { type });
}

export class DownloadHttpError extends TaggedFailure<
  DownloadHttpError,
  { readonly brand: unique symbol }
>()("DownloadHttpError", {
  statusCode: Schema.Finite,
  message: Schema.String,
}) {
  static new(statusCode: number) {
    return new DownloadHttpError({
      statusCode,
      message: `Download returned HTTP ${statusCode}`,
    });
  }
}

export function decodeTextDownload(
  response: Pick<DownloadResponse, "statusCode" | "data">,
): string {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw DownloadHttpError.new(response.statusCode);
  }
  return new TextDecoder().decode(response.data);
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTextDownload, DownloadHttpError } from "./download.ts";

test("HTTP error responses cannot import their bodies as proxy lists", () => {
  const data = new TextEncoder().encode("127.0.0.1:1080");
  for (const statusCode of [301, 302, 403, 404, 500]) {
    assert.throws(
      () => decodeTextDownload({ statusCode, data }),
      (error) =>
        error instanceof DownloadHttpError && error.statusCode === statusCode,
    );
  }
  assert.equal(decodeTextDownload({ statusCode: 200, data }), "127.0.0.1:1080");
});

test("successful text downloads preserve Unicode and permit empty content", () => {
  const text = "München\n東京\n";
  assert.equal(
    decodeTextDownload({
      statusCode: 200,
      data: new TextEncoder().encode(text),
    }),
    text,
  );
  assert.equal(
    decodeTextDownload({ statusCode: 204, data: new Uint8Array() }),
    "",
  );
});

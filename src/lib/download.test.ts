import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTextBlob,
  decodeTextDownload,
  DownloadHttpError,
} from "./download.ts";

test("text exports encode non-ASCII credentials as UTF-8", async () => {
  const text = "127.0.0.1:1080:用户:pässβ🔑\n[::1]:1080:qa:東京";
  const blob = createTextBlob(text);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  assert.deepEqual(bytes, new TextEncoder().encode(text));
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), text);
});

test("JSON profile exports preserve Unicode when read back", async () => {
  const profile = {
    settings: { messages: ["München", "東京", "🎮"] },
    proxies: [{ username: "qa@β", password: "päss🔑" }],
  };
  const blob = createTextBlob(JSON.stringify(profile), "application/json");

  assert.equal(blob.type.split(";")[0], "application/json");
  assert.deepEqual(JSON.parse(await blob.text()), profile);
});

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

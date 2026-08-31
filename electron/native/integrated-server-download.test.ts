import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { downloadToFile } from "./integrated-server-download";

test("cancelling an in-flight download closes the response and removes the partial file", {
  timeout: 10_000,
}, async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "soulfire-download-test-"),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));
  const events = new EventEmitter();
  const responseClosed = once(events, "closed");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Length": 10_000 });
    response.write(Buffer.alloc(100));
    response.on("close", () => events.emit("closed"));
  });
  context.after(() => {
    server.closeAllConnections();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const controller = new AbortController();
  const destination = path.join(directory, "java.download");
  await assert.rejects(
    downloadToFile(
      `http://127.0.0.1:${address.port}`,
      destination,
      controller.signal,
      () => controller.abort(),
    ),
  );
  await responseClosed;
  assert.equal(await stat(destination).catch(() => null), null);
});

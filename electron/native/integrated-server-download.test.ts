import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Effect, Fiber } from "effect";
import {
  downloadToFile,
  downloadToFileEffect,
} from "./integrated-server-download";

test(
  "cancelling an in-flight download closes the response and removes the partial file",
  {
    timeout: 10_000,
  },
  async (context) => {
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
  },
);

test("a completed download retains its file after its scope closes", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "soulfire-download-test-"),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));
  const server = createServer((_request, response) =>
    response.end("server archive"),
  );
  context.after(() => {
    server.closeAllConnections();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const destination = path.join(directory, "java.download");
  await downloadToFile(
    `http://127.0.0.1:${address.port}`,
    destination,
    new AbortController().signal,
    () => {},
  );
  assert.equal(await readFile(destination, "utf8"), "server archive");
});

test("interrupting the download fiber waits for file and response cleanup", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "soulfire-download-test-"),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));
  const events = new EventEmitter();
  const responseClosed = once(events, "closed");
  const progress = once(events, "progress");
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
  const destination = path.join(directory, "java.download");
  const fiber = Effect.runFork(
    downloadToFileEffect(
      `http://127.0.0.1:${address.port}`,
      destination,
      new AbortController().signal,
      () => events.emit("progress"),
    ),
  );
  try {
    await progress;
    await Effect.runPromise(Fiber.interrupt(fiber));
    await responseClosed;
    assert.equal(await stat(destination).catch(() => null), null);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
});

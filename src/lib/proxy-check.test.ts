import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { ProxyCheckResponseSchema } from "@/generated/soulfire/proxy-check_pb";
import { checkProxies } from "./proxy-check";

const failed = (address: string) =>
  create(ProxyCheckResponseSchema, {
    data: { case: "single", value: { valid: false, proxy: { address } } },
  });
const end = () =>
  create(ProxyCheckResponseSchema, { data: { case: "end", value: {} } });

test("consumes progress before removing failed proxies in one batch", async () => {
  const events: string[] = [];
  async function* responses() {
    yield failed("host:1");
    yield failed("host:2");
    yield create(ProxyCheckResponseSchema, {
      data: { case: "single", value: { valid: true } },
    });
    events.push("stream finished");
    yield end();
  }
  const result = await checkProxies(
    responses(),
    new AbortController().signal,
    async (proxies) => {
      events.push(`remove ${proxies.map((p) => p.address).join(",")}`);
    },
    ({ success, failed }) => {
      events.push(`progress ${success + failed}`);
    },
  );
  assert.deepEqual(result, { success: 1, failed: 2 });
  assert.deepEqual(events, [
    "progress 1",
    "progress 2",
    "progress 3",
    "stream finished",
    "remove host:1,host:2",
  ]);
});

test("cancellation does not remove partially checked proxies", async () => {
  const abort = new AbortController();
  let removals = 0;
  async function* responses() {
    yield failed("host:1");
    abort.abort();
    yield end();
  }
  await assert.rejects(
    checkProxies(
      responses(),
      abort.signal,
      async () => {
        removals++;
      },
      () => {},
    ),
    { name: "AbortError" },
  );
  assert.equal(removals, 0);
});

test("an incomplete stream or failed settings write cannot report success", async () => {
  async function* incomplete() {
    yield failed("host:1");
  }
  await assert.rejects(
    checkProxies(
      incomplete(),
      new AbortController().signal,
      async () => {},
      () => {},
    ),
    /completion message/,
  );
  async function* complete() {
    yield failed("host:1");
    yield end();
  }
  await assert.rejects(
    checkProxies(
      complete(),
      new AbortController().signal,
      async () => {
        throw new Error("write failed");
      },
      () => {},
    ),
    /write failed/,
  );
});

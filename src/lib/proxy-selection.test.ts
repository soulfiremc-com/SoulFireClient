import assert from "node:assert/strict";
import { test } from "node:test";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import type { ProfileProxy } from "@/lib/types.ts";
import { getProxyKey, removeProxyEntries } from "./proxy-selection.ts";

const proxy = (overrides: Partial<ProfileProxy> = {}): ProfileProxy => ({
  type: ProxyProto_Type.HTTP,
  address: "inet://127.0.0.1:1080",
  username: "user",
  password: "pass",
  ...overrides,
});

test("proxy keys cannot collide when credentials contain separators", () => {
  const first = proxy({ username: "a-b", password: "c" });
  const second = proxy({ username: "a", password: "b-c" });
  assert.notEqual(getProxyKey(first), getProxyKey(second));
  assert.equal(getProxyKey(first), getProxyKey({ ...first }));
});

test("exact removal keeps credential and protocol neighbors at the same endpoint", () => {
  const first = proxy();
  const second = proxy({ username: "other" });
  const protocol = proxy({ type: ProxyProto_Type.SOCKS5 });
  const address = proxy({ address: "inet://127.0.0.2:1080" });
  assert.deepEqual(
    removeProxyEntries(
      [first, second, protocol, address],
      [first, proxy({ username: "missing" })],
    ),
    [second, protocol, address],
  );
});

test("each selected occurrence removes one entry without mutating the inputs", () => {
  const first = proxy();
  const second = proxy({ username: "other" });
  const proxies = [first, second, first, first];
  const selected = [{ ...first }, { ...first }];
  assert.deepEqual(removeProxyEntries(proxies, selected), [second, first]);
  assert.equal(proxies.length, 4);
  assert.equal(selected.length, 2);
});

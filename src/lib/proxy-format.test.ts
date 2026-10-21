import assert from "node:assert/strict";
import { test } from "node:test";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import {
  formatProxyAsFlat,
  formatProxyAsURI,
  parseNormalProxy,
  parseURIProxy,
} from "./proxy-format.ts";

test("flat and user-info imports preserve complete credentials", () => {
  for (const line of [
    "127.0.0.1:1080:qa-user:part1:part2@tail",
    "qa-user:part1:part2@tail@127.0.0.1:1080",
  ]) {
    assert.deepEqual(parseNormalProxy(line, ProxyProto_Type.SOCKS5), {
      type: ProxyProto_Type.SOCKS5,
      address: "inet://127.0.0.1:1080",
      username: "qa-user",
      password: "part1:part2@tail",
    });
  }
});

test("bracketed IPv6 imports retain the complete endpoint", () => {
  for (const line of [
    "[2001:db8::5]:1080:qa-user:part1:part2",
    "qa-user:part1:part2@[2001:db8::5]:1080",
  ]) {
    assert.deepEqual(parseNormalProxy(line, ProxyProto_Type.HTTP), {
      type: ProxyProto_Type.HTTP,
      address: "inet://[2001:db8::5]:1080",
      username: "qa-user",
      password: "part1:part2",
    });
  }
});

test("user-info imports support username-only authentication", () => {
  for (const address of ["127.0.0.1:1080", "[::1]:1080"]) {
    assert.deepEqual(
      parseNormalProxy(`qa-user@${address}`, ProxyProto_Type.SOCKS4),
      {
        type: ProxyProto_Type.SOCKS4,
        address: `inet://${address}`,
        username: "qa-user",
        password: undefined,
      },
    );
  }
});

test("URI exports round-trip reserved characters, Unicode, and IPv6", () => {
  for (const type of [
    ProxyProto_Type.HTTP,
    ProxyProto_Type.SOCKS4,
    ProxyProto_Type.SOCKS5,
  ]) {
    const passwords =
      type === ProxyProto_Type.SOCKS4
        ? [undefined]
        : [undefined, "part1:part2@tail/#?% Grüße"];
    for (const password of passwords) {
      const proxy = {
        type,
        address: "inet://[::1]:1080",
        username: "qa:user@/#?%",
        password,
      };
      assert.deepEqual(parseURIProxy(formatProxyAsURI(proxy)), proxy);
    }
  }
});

test("flat exports round-trip complete passwords and username-only authentication", () => {
  for (const password of [undefined, "part1:part2@tail"]) {
    const proxy = {
      type: ProxyProto_Type.SOCKS5,
      address: "inet://[::1]:1080",
      username: "qa-user",
      password,
    };
    assert.deepEqual(
      parseNormalProxy(formatProxyAsFlat(proxy), proxy.type),
      proxy,
    );
  }
});

test("unauthenticated imports and exports preserve protocol and endpoint", () => {
  for (const type of [
    ProxyProto_Type.HTTP,
    ProxyProto_Type.SOCKS4,
    ProxyProto_Type.SOCKS5,
  ]) {
    const proxy = {
      type,
      address: "inet://127.0.0.1:1080",
      username: undefined,
      password: undefined,
    };
    assert.deepEqual(parseNormalProxy("127.0.0.1:1080", type), proxy);
    assert.deepEqual(parseURIProxy(formatProxyAsURI(proxy)), proxy);
  }
});

test("malformed flat endpoints and invalid ports fail instead of truncating", () => {
  for (const line of [
    "missing-port",
    "127.0.0.1:0",
    "127.0.0.1:65536",
    "127.0.0.1:NaN",
    "[::1:1080",
    "::1:1080",
  ]) {
    assert.throws(() => parseNormalProxy(line, ProxyProto_Type.SOCKS5));
  }
  assert.equal(parseURIProxy("https://127.0.0.1:1080"), null);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import { parseProxyImport } from "./proxy-import";

test("mixed flat imports report original line numbers without discarding valid entries", () => {
  const result = parseProxyImport(
    "\n 127.0.0.1:1080:user:secret \r\ninvalid\n\n[::1]:1080\n127.0.0.1:65536",
    ProxyProto_Type.SOCKS5,
  );
  assert.deepEqual(result.rejectedLines, [3, 6]);
  assert.equal(result.proxies.length, 2);
  assert.equal(result.proxies[0].password, "secret");
  assert.equal(result.proxies[1].address, "inet://[::1]:1080");
});

test("unsupported URI protocols are rejected with malformed lines", () => {
  const result = parseProxyImport(
    "socks5://user:secret@localhost:1080\nhttps://localhost:1080\nnot a URL",
    "uri",
  );
  assert.deepEqual(result.rejectedLines, [2, 3]);
  assert.equal(result.proxies.length, 1);
  assert.equal(result.proxies[0].type, ProxyProto_Type.SOCKS5);
});

test("empty imports and corrected drafts are evaluated independently", () => {
  assert.deepEqual(parseProxyImport("\r\n \n", "uri"), {
    proxies: [],
    rejectedLines: [],
  });
  assert.deepEqual(
    parseProxyImport("localhost:1080", ProxyProto_Type.HTTP).rejectedLines,
    [],
  );
});

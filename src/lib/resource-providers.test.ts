import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCOUNT_PROVIDERS,
  PROXY_PROVIDERS,
} from "@/lib/resource-providers.ts";

test("keeps exact affiliate identifiers", () => {
  const urls = Object.fromEntries(
    [...PROXY_PROVIDERS, ...ACCOUNT_PROVIDERS].map((entry) => [
      entry.id,
      entry.url,
    ]),
  );
  assert.ok(urls.webshare?.includes("referral_code=36gneippfiwt"));
  assert.ok(urls["proxy-seller"]?.includes("partner=GRJY71PA3XWPPP"));
  assert.ok(urls.proxyscrape?.includes("ref=mge4mtc"));
  assert.ok(urls.iproyal?.includes("r=soulfire"));
  assert.ok(urls.decodo?.includes("/K0rr7e"));
  assert.ok(urls.oxylabs?.includes("aff_id=1896"));
  assert.equal(urls.localts, "https://localts.store/?campaign=soulfire");
  assert.equal(urls["alts-fast"], "https://alts.fast/?referral=SOULFIRE");
  assert.equal(urls.kynoselling, "https://kynoselling.xyz/?ref=SOULFIRE");
});

test("only documented integrations advertise in-app purchases", () => {
  const buyers = [...PROXY_PROVIDERS, ...ACCOUNT_PROVIDERS]
    .filter((entry) => entry.capabilities.includes("buy"))
    .map((entry) => entry.id);
  assert.deepEqual(buyers, ["proxy-seller", "ravealts", "fernan", "localts"]);
});

test("checkout-only providers have no connection or requirements", () => {
  for (const entry of [...PROXY_PROVIDERS, ...ACCOUNT_PROVIDERS]) {
    if (!entry.capabilities.includes("checkout")) continue;
    assert.deepEqual(entry.capabilities, ["checkout"]);
    assert.equal(entry.connection, undefined);
    assert.deepEqual(entry.needs, []);
  }
});

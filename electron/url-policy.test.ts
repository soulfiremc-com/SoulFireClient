import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedRendererUrl, isSafeExternalUrl } from "./url-policy";

const devServer = new URL("http://localhost:1420/");

test("only the app protocol and the dev server origin may use the desktop API", () => {
  assert.equal(isAllowedRendererUrl("app://soulfire/", null), true);
  assert.equal(
    isAllowedRendererUrl("app://soulfire/user/settings", null),
    true,
  );
  assert.equal(isAllowedRendererUrl("app://evil/", null), false);
  assert.equal(isAllowedRendererUrl("app://soulfire.evil/", null), false);
  assert.equal(
    isAllowedRendererUrl("http://localhost:1420/x", devServer),
    true,
  );
  // Packaged builds pass no dev server, so the dev origin is not trusted.
  assert.equal(isAllowedRendererUrl("http://localhost:1420/x", null), false);
  assert.equal(
    isAllowedRendererUrl("http://localhost:1421/", devServer),
    false,
  );
  assert.equal(isAllowedRendererUrl("https://example.com/", devServer), false);
  assert.equal(isAllowedRendererUrl("file:///etc/passwd", devServer), false);
  // oxlint-disable-next-line eslint/no-script-url -- Verify that script URLs are rejected.
  assert.equal(isAllowedRendererUrl("javascript:alert(1)", devServer), false);
  assert.equal(isAllowedRendererUrl("about:blank", devServer), false);
  assert.equal(isAllowedRendererUrl("not a url", devServer), false);
});

test("only web and mail links open outside the app", () => {
  assert.equal(isSafeExternalUrl("https://soulfiremc.com/"), true);
  assert.equal(isSafeExternalUrl("http://play.example.net/"), true);
  assert.equal(isSafeExternalUrl("mailto:support@example.com"), true);
  // oxlint-disable-next-line eslint/no-script-url -- Verify that script URLs are rejected.
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(
    isSafeExternalUrl("file:///C:/Windows/System32/calc.exe"),
    false,
  );
  assert.equal(isSafeExternalUrl("app://soulfire/"), false);
  assert.equal(isSafeExternalUrl("smb://host/share"), false);
  assert.equal(isSafeExternalUrl(""), false);
});

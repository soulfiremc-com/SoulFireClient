import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { hashInlineScriptsInCsp } from "./csp-inline-script-hashes";

const themeScript =
  "\n      document.documentElement.classList.add('dark');\n    ";

const html = `<!doctype html>
<html>
  <head>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' https://tc.soulfiremc.com; style-src 'self' 'unsafe-inline'; object-src 'none';"
    />
    <script>${themeScript}</script>
    <script type="module" crossorigin src="./assets/index.js"></script>
  </head>
</html>`;

test("inline scripts are allowed by hash instead of 'unsafe-inline'", () => {
  const hash = createHash("sha256").update(themeScript).digest("base64");
  const result = hashInlineScriptsInCsp(html);
  const policy = /content="([^"]*)"/u.exec(result)?.[1];
  assert.equal(
    policy,
    `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://tc.soulfiremc.com 'sha256-${hash}'; style-src 'self' 'unsafe-inline'; object-src 'none';`,
  );
  assert.ok(result.includes(`<script>${themeScript}</script>`));
});

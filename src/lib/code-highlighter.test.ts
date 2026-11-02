import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightCode, type CodeLanguage } from "./code-highlighter.ts";

const samples: Record<CodeLanguage, string> = {
  typescript: 'const value = "Hello";\nconsole.log(value);\n',
  python: 'import os\nprint("Hello", 42)\n',
  shellscript:
    "export SOULFIRE_TOKEN='PASTE_YOUR_API_TOKEN'\nbun run example.ts",
  powershell:
    "$env:SOULFIRE_TOKEN = 'PASTE_YOUR_API_TOKEN'\nbun run example.ts",
};

for (const [language, code] of Object.entries(samples)) {
  test(`${language} highlights both themes without changing copyable text`, async () => {
    const lines = await highlightCode(code, language as CodeLanguage);
    assert.equal(
      lines
        .map(
          (line) =>
            line.tokens.map((token) => token.content).join("") + line.newline,
        )
        .join(""),
      code,
    );
    for (const theme of ["light", "dark"]) {
      const colors = new Set(
        lines.flatMap((line) =>
          line.tokens.map((token) => token.variants[theme].color),
        ),
      );
      assert.ok(colors.size > 1, `${theme} syntax colors`);
    }
    assert.equal(new Set(lines.map((line) => line.offset)).size, lines.length);
  });
}

test("markup-like strings remain text tokens", async () => {
  const code = 'const name = "<img src=x onerror=alert(1)>";';
  const lines = await highlightCode(code, "typescript");
  assert.equal(
    lines.flatMap((line) => line.tokens.map((token) => token.content)).join(""),
    code,
  );
});

test("Windows line endings and empty lines remain intact", async () => {
  const code = 'const token = "sample";\r\n\r\nconsole.log(token);\r\n';
  const lines = await highlightCode(code, "typescript");
  assert.equal(
    lines
      .map(
        (line) =>
          line.tokens.map((token) => token.content).join("") + line.newline,
      )
      .join(""),
    code,
  );
});

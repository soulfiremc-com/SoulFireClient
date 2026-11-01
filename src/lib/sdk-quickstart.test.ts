import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildSdkQuickstart,
  isLocalSdkServer,
  SDK_RECIPES,
  sdkServerUrl,
} from "./sdk-quickstart.ts";

describe("SDK connection addresses", () => {
  test("preserves the actual port and reverse-proxy path", () => {
    assert.equal(
      sdkServerUrl("http://127.0.0.1:43217/"),
      "http://127.0.0.1:43217",
    );
    assert.equal(
      sdkServerUrl("https://example.test/soulfire/"),
      "https://example.test/soulfire",
    );
  });
  test("does not include URL credentials or query secrets in examples", () => {
    assert.equal(sdkServerUrl("https://user:password@example.test"), null);
    assert.equal(
      sdkServerUrl("https://example.test/api?token=private#private"),
      "https://example.test/api",
    );
  });
  test("rejects missing addresses and unsupported protocols", () => {
    for (const address of [
      null,
      undefined,
      "",
      "localhost:38765",
      "file:///tmp/server",
      "javascript:alert(1)",
    ])
      assert.equal(sdkServerUrl(address), null);
  });
  test("distinguishes loopback from remote hosts", () => {
    for (const url of [
      "http://localhost:43217",
      "http://127.0.0.2",
      "http://[::1]:38765",
      "https://dev.localhost",
    ])
      assert.equal(isLocalSdkServer(url), true);
    for (const url of [
      "https://localhost.example.test",
      "https://127.example.test",
      "http://192.168.1.2:38765",
      "invalid",
    ])
      assert.equal(isLocalSdkServer(url), false);
  });
});

describe("SDK starter projects", () => {
  const target = {
    serverUrl: "http://localhost:43217",
    instanceId: "11111111-1111-4111-8111-111111111111",
    botId: "22222222-2222-4222-8222-222222222222",
  };
  for (const recipe of SDK_RECIPES)
    test(`both languages use the selected instance for ${recipe}`, () => {
      for (const language of ["typescript", "python"] as const) {
        const result = buildSdkQuickstart({
          ...target,
          language,
          recipe,
          shell: "posix",
        });
        assert.ok(result.script.includes(target.serverUrl));
        assert.ok(result.script.includes(target.instanceId));
        assert.equal(
          result.script.includes(target.botId),
          recipe !== "list-bots",
        );
        assert.ok(result.script.includes("SOULFIRE_TOKEN"));
        assert.ok(result.run.includes("PASTE_YOUR_API_TOKEN"));
        assert.ok(result.run.includes(result.filename));
      }
    });
  test("Windows Python commands use the virtual environment without activation", () => {
    const result = buildSdkQuickstart({
      ...target,
      language: "python",
      recipe: "list-bots",
      shell: "powershell",
    });
    assert.ok(result.install.includes("py -3.14 -m venv .venv"));
    assert.ok(
      result.install.includes(
        ".venv\\Scripts\\python.exe -m pip install soulfire==2.10.6",
      ),
    );
    assert.equal(
      result.run,
      "$env:SOULFIRE_TOKEN = 'PASTE_YOUR_API_TOKEN'\n.venv\\Scripts\\python.exe example.py",
    );
  });
  test("Unix Python commands stay inside the virtual environment", () => {
    const result = buildSdkQuickstart({
      ...target,
      language: "python",
      recipe: "list-bots",
      shell: "posix",
    });
    assert.ok(result.install.includes("python3.14 -m venv .venv"));
    assert.ok(result.install.includes(".venv/bin/python -m pip install"));
    assert.equal(
      result.run,
      "export SOULFIRE_TOKEN='PASTE_YOUR_API_TOKEN'\n.venv/bin/python example.py",
    );
  });
  test("missing targets use explicit placeholders", () => {
    const result = buildSdkQuickstart({
      language: "typescript",
      recipe: "read-state",
      shell: "posix",
      serverUrl: "",
      instanceId: "YOUR_INSTANCE_ID",
    });
    assert.ok(result.script.includes('baseUrl: "YOUR_SOULFIRE_SERVER_URL"'));
    assert.ok(result.script.includes('instance.bot("YOUR_BOT_ID")'));
  });
  test("quotes and line breaks in IDs stay inside string literals", () => {
    const id = 'example"\n\\next';
    for (const language of ["typescript", "python"] as const) {
      const result = buildSdkQuickstart({
        ...target,
        instanceId: id,
        botId: id,
        language,
        recipe: "read-state",
        shell: "posix",
      });
      assert.ok(result.script.includes(`instance(${JSON.stringify(id)})`));
      assert.ok(result.script.includes(`bot(${JSON.stringify(id)})`));
    }
  });
});

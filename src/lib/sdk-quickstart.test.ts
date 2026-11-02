import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildSdkQuickstart,
  buildSdkAgentPrompt,
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

describe("agent prompts", () => {
  const target = {
    language: "typescript" as const,
    recipe: "list-bots" as const,
    shell: "posix" as const,
    serverUrl:
      "https://server.example.test/api?token=private-query#private-fragment",
    instanceId: "instance-current",
    instanceName: "Current instance",
    botId: "bot-current",
    botName: "Builder",
    token: "generated-token-must-stay-private",
  };
  test("uses the current connection, verified example and exact installation commands", () => {
    const prompt = buildSdkAgentPrompt(target);
    const example = buildSdkQuickstart(target);
    assert.ok(prompt.includes("https://server.example.test/api"));
    assert.ok(prompt.includes(target.instanceId));
    assert.ok(prompt.includes(example.install));
    assert.ok(prompt.includes(example.script.trimEnd()));
    assert.ok(prompt.includes("SOULFIRE_TOKEN"));
    assert.ok(prompt.includes("https://ts.soulfiremc.com/"));
    assert.ok(!prompt.includes(target.token));
    assert.ok(!prompt.includes("private-query"));
    assert.ok(!prompt.includes("private-fragment"));
    assert.ok(!prompt.includes(target.botId));
  });
  test("bot actions include the selected bot and terminal platform", () => {
    const prompt = buildSdkAgentPrompt({
      ...target,
      language: "python",
      recipe: "send-chat",
      shell: "powershell",
    });
    assert.ok(prompt.includes(target.botId));
    assert.ok(prompt.includes(target.botName));
    assert.ok(prompt.includes("Windows PowerShell"));
    assert.ok(prompt.includes("py -3.14 -m venv .venv"));
    assert.ok(prompt.includes("https://py.soulfiremc.com/"));
    assert.ok(prompt.includes("only when I run the script"));
  });
  test("demo samples match the displayed target and ask for real connection details", () => {
    const options = {
      ...target,
      demo: true,
      serverUrl: "",
      instanceId: "demo",
      recipe: "read-state" as const,
    };
    const example = buildSdkQuickstart(options);
    const prompt = buildSdkAgentPrompt(options);
    assert.ok(example.script.startsWith("// Demo sample."));
    assert.ok(example.script.includes('client.instance("demo")'));
    assert.ok(example.script.includes(target.botId));
    assert.ok(prompt.includes("All target values are samples"));
    assert.ok(prompt.includes("Ask me for my real server address"));
    assert.ok(!prompt.includes("demo.soulfiremc.com"));
  });
  test("credentialed addresses cannot enter prompts", () => {
    const prompt = buildSdkAgentPrompt({
      ...target,
      serverUrl: "https://user:secret-password@server.example.test",
    });
    assert.ok(!prompt.includes("secret-password"));
    assert.ok(prompt.includes("ask me for the real SoulFire API address"));
  });
  test("bot-specific prompts request a missing bot ID", () => {
    const prompt = buildSdkAgentPrompt({
      ...target,
      recipe: "read-state",
      botId: undefined,
    });
    assert.ok(prompt.includes("Ask me for a bot profile ID"));
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
  test("Python reports a missing API token before connecting", () => {
    const example = buildSdkQuickstart({
      ...target,
      language: "python",
      recipe: "list-bots",
      shell: "posix",
    });
    assert.ok(
      example.script.includes('token = os.environ.get("SOULFIRE_TOKEN")'),
    );
    assert.ok(
      example.script.includes(
        'raise SystemExit("Set SOULFIRE_TOKEN before running.")',
      ),
    );
    assert.ok(
      example.script.indexOf("raise SystemExit") <
        example.script.indexOf("SoulFire.connect"),
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

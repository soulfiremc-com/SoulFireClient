// Examples verified against the published TypeScript and Python SDKs.
export const SDK_EXAMPLE_VERSION = "2.10.6";
export const SDK_RECIPES = ["list-bots", "read-state", "send-chat"] as const;
export type SdkRecipe = (typeof SDK_RECIPES)[number];
export type SdkLanguage = "typescript" | "python";
export type SdkShell = "posix" | "powershell";

export function sdkServerUrl(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  try {
    const url = new URL(address);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isLocalSdkServer(address: string): boolean {
  const url = sdkServerUrl(address);
  if (!url) return false;
  const { hostname } = new URL(url);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

export function buildSdkQuickstart(options: {
  language: SdkLanguage;
  recipe: SdkRecipe;
  shell: SdkShell;
  serverUrl: string;
  instanceId: string;
  botId?: string;
}) {
  const { language, recipe, shell, serverUrl, instanceId } = options;
  const url = JSON.stringify(
    sdkServerUrl(serverUrl) ?? "YOUR_SOULFIRE_SERVER_URL",
  );
  const instance = JSON.stringify(instanceId);
  const bot = JSON.stringify(options.botId || "YOUR_BOT_ID");
  const setToken =
    shell === "powershell"
      ? "$env:SOULFIRE_TOKEN = 'PASTE_YOUR_API_TOKEN'"
      : "export SOULFIRE_TOKEN='PASTE_YOUR_API_TOKEN'";

  if (language === "typescript") {
    const operation =
      recipe === "list-bots"
        ? `    const bots = yield* instance.bots();\n    console.table(bots.map((bot) => ({\n      name: bot.accountName,\n      id: bot.profileId,\n      connected: bot.isOnline,\n    })));`
        : `    const bot = instance.bot(${bot});\n${
            recipe === "read-state"
              ? "    const info = yield* bot.info();\n    console.log(info.liveState);"
              : '    yield* bot.chat.send("Hello from the SoulFire SDK!");\n    console.log("Message sent.");'
          }`;
    return {
      filename: "example.ts",
      install: `bun add @soulfiremc/sdk@${SDK_EXAMPLE_VERSION} "effect@^4"`,
      run: `${setToken}\nbun run example.ts`,
      script: `import { Effect } from "effect";
import { SoulFire } from "@soulfiremc/sdk/bun";

const token = process.env.SOULFIRE_TOKEN;
if (!token) throw new Error("Set SOULFIRE_TOKEN before running.");

const program = Effect.scoped(
  Effect.gen(function* () {
    const client = yield* SoulFire.connect({
      baseUrl: ${url},
      token,
    });
    const instance = client.instance(${instance});
${operation}
  }),
);

await Effect.runPromise(program);
`,
    };
  }

  const executable =
    shell === "powershell" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
  const createVenv =
    shell === "powershell"
      ? "py -3.14 -m venv .venv"
      : "python3.14 -m venv .venv";
  const operation =
    recipe === "list-bots"
      ? `    bots = yield from instance.bots()\n    for bot in bots:\n        print(bot.account_name, bot.profile_id, bot.is_online)`
      : `    bot = instance.bot(${bot})\n${
          recipe === "read-state"
            ? "    info = yield from bot.info()\n    print(info.live_state)"
            : '    yield from bot.chat.send("Hello from the SoulFire SDK!")\n    print("Message sent.")'
        }`;
  return {
    filename: "example.py",
    install: `${createVenv}\n${executable} -m pip install soulfire==${SDK_EXAMPLE_VERSION}`,
    run: `${setToken}\n${executable} example.py`,
    script: `import asyncio
import os

from effect_py import EffectGen, Scope, gen, run_async, scoped
from soulfire import SoulFire, SoulFireOperationError


@gen
def program() -> EffectGen[None, SoulFireOperationError, Scope]:
    client = yield from SoulFire.connect(
        ${url},
        token=os.environ["SOULFIRE_TOKEN"],
    )
    instance = client.instance(${instance})
${operation}


asyncio.run(run_async(scoped(program).or_die()))
`,
  };
}

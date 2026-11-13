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

export type SdkQuickstartOptions = {
  language: SdkLanguage;
  recipe: SdkRecipe;
  shell: SdkShell;
  serverUrl: string;
  instanceId: string;
  botId?: string;
  demo?: boolean;
};

export function buildSdkQuickstart(options: SdkQuickstartOptions) {
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
  const demoComment = options.demo
    ? "Demo sample. Replace the server URL and target IDs before running.\n\n"
    : "";

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
      script: `${demoComment ? `// ${demoComment}` : ""}import { Effect } from "effect";
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
    script: `${demoComment ? `# ${demoComment}` : ""}import asyncio
import os

from effect_py import EffectGen, Scope, gen, run_async, scoped
from soulfire import SoulFire, SoulFireOperationError

token = os.environ.get("SOULFIRE_TOKEN")
if not token:
    raise SystemExit("Set SOULFIRE_TOKEN before running.")


@gen
def program() -> EffectGen[None, SoulFireOperationError, Scope]:
    client = yield from SoulFire.connect(
        ${url},
        token=token,
    )
    instance = client.instance(${instance})
${operation}


asyncio.run(run_async(scoped(program).or_die()))
`,
  };
}

const AGENT_GOALS: Record<SdkRecipe, string> = {
  "list-bots":
    "list the names, profile IDs, and connection states of every bot in the selected project",
  "read-state":
    "read and print the latest live state of the selected bot without starting it",
  "send-chat":
    "send one public chat message as the selected bot, only when I run the script",
};

export function buildSdkAgentPrompt(
  options: SdkQuickstartOptions & {
    instanceName: string;
    botName?: string;
  },
) {
  const example = buildSdkQuickstart(options);
  const url = sdkServerUrl(options.serverUrl);
  const target = [
    `SoulFire API base URL: ${url ?? "ask me for the real SoulFire API address before running"}`,
    `Project: ${JSON.stringify(options.instanceName)} (ID: ${JSON.stringify(options.instanceId)})`,
    "Projects use the SDK instance API: keep client.instance(), instanceId, and instance_id unchanged.",
    ...(options.recipe !== "list-bots"
      ? [
          `Bot profile ID: ${JSON.stringify(options.botId || "YOUR_BOT_ID")}${options.botName ? ` (${JSON.stringify(options.botName)})` : ""}`,
        ]
      : []),
  ];
  return [
    `Write a ${options.language === "python" ? "Python 3.14+" : "TypeScript / Bun"} script using the SoulFire SDK to ${AGENT_GOALS[options.recipe]}.`,
    ...(options.demo
      ? [
          "This prompt was copied from demo mode. All target values are samples. Ask me for my real server address, project ID, and bot ID before running anything.",
        ]
      : []),
    "",
    ...target,
    ...(options.recipe !== "list-bots" && !options.botId
      ? [
          "No bot is selected. Ask me for a bot profile ID from this project before running the bot-specific example.",
        ]
      : []),
    `Terminal: ${options.shell === "powershell" ? "Windows PowerShell" : "macOS / Linux"}`,
    "",
    `Use SDK ${SDK_EXAMPLE_VERSION}. Install dependencies with:`,
    example.install,
    "",
    "Read the personal API token from SOULFIRE_TOKEN. Never hard-code or print it, and do not ask me to paste it into this conversation. I will set it locally in my terminal.",
    ...(url && isLocalSdkServer(url)
      ? [
          "This API address is local. Run the script on the same computer as the SoulFire server.",
        ]
      : []),
    "",
    "Start from this verified example and preserve its scoped connection cleanup:",
    `\`\`\`${options.language}`,
    example.script.trimEnd(),
    "```",
    "",
    "Run commands (replace the token placeholder locally):",
    example.run,
    "",
    "SDK guide: https://soulfiremc.com/docs/sdk",
    `API reference: ${options.language === "python" ? "https://py.soulfiremc.com/" : "https://ts.soulfiremc.com/"}`,
  ].join("\n");
}

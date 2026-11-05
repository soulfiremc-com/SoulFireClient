import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { createInstance } from "i18next";
import common from "../../locales/en-US/common.json";
import { ClientDataResponseSchema } from "@/generated/soulfire/client_pb";
import {
  BotDesiredState,
  BotListEntrySchema,
  BotRuntimeState,
} from "@/generated/soulfire/bot_pb";
import {
  GlobalPermission,
  InstancePermission,
  SettingsDefinitionSchema,
  SettingsPageSchema,
} from "@/generated/soulfire/common_pb";
import {
  InstanceInfoSchema,
  InstanceListResponse_InstanceSchema,
} from "@/generated/soulfire/instance_pb";
import { ScriptInfoSchema } from "@/generated/soulfire/script_pb";
import {
  createPaletteCommands,
  isPaletteShortcut,
  matchesPaletteFilter,
  readPaletteRecents,
  rememberPaletteCommand,
  resolvePaletteRecents,
  searchPaletteCommands,
  paletteMatchSegments,
} from "./command-palette";
import type { InstanceInfoQueryData } from "./types";

const i18n = createInstance();
void i18n.init({
  lng: "en-US",
  resources: { "en-US": { common } },
  defaultNS: "common",
  initAsync: false,
});
const t = (key: string, options?: Record<string, string | number>) =>
  i18n.t(key, options);
const project = (
  id: string,
  permissions: InstancePermission[] = [InstancePermission.READ_INSTANCE],
) =>
  create(InstanceListResponse_InstanceSchema, {
    id,
    friendlyName: "Test farm",
    instancePermissions: permissions.map((instancePermission) => ({
      instancePermission,
      granted: true,
    })),
  });
const client = (permissions: GlobalPermission[]) =>
  create(ClientDataResponseSchema, {
    id: "user-1",
    serverPermissions: permissions.map((globalPermission) => ({
      globalPermission,
      granted: true,
    })),
  });
const current: InstanceInfoQueryData = {
  ...create(InstanceInfoSchema, {
    friendlyName: "Test farm",
    instancePermissions: [
      InstancePermission.READ_INSTANCE,
      InstancePermission.READ_BOT_INFO,
    ].map((instancePermission) => ({ instancePermission, granted: true })),
    instanceSettings: [
      create(SettingsPageSchema, {
        id: "anti-afk",
        pageName: "Prevent idle kicks",
        owningPluginId: "idle-plugin",
        entries: [{ namespace: "anti-afk", key: "interval" }],
      }),
    ],
    settingsDefinitions: [
      create(SettingsDefinitionSchema, {
        id: { namespace: "anti-afk", key: "interval" },
        type: { case: "int", value: { uiName: "Movement interval" } },
      }),
    ],
  }),
  id: "farm-1",
  profile: {
    settings: { "anti-afk": { interval: "private-value" } },
    proxies: [],
    accounts: [
      {
        profileId: "bot-id",
        lastKnownName: "AlexBot",
        type: 0,
        accountData: { case: undefined },
        config: [],
        persistentMetadata: [],
      },
    ],
  },
};

test("project destinations obey permissions and keep duplicate names distinct", () => {
  const commands = createPaletteCommands({
    t,
    instances: [
      project("farm-1", [
        InstancePermission.READ_INSTANCE,
        InstancePermission.INSTANCE_COMMAND_EXECUTION,
      ]),
      project("farm-2"),
      project("hidden", []),
    ],
  });
  assert.equal(
    new Set(commands.map((command) => command.id)).size,
    commands.length,
  );
  assert.deepEqual(
    commands.find((command) => command.id === "project:farm-2")?.destination,
    { to: "/instance/$instance", params: { instance: "farm-2" } },
  );
  assert(commands.some((command) => command.id === "terminal:farm-1"));
  assert(!commands.some((command) => command.id === "terminal:farm-2"));
  assert(!commands.some((command) => command.id === "bots:farm-1"));
  assert(!commands.some((command) => command.id.endsWith(":hidden")));
});

test("creation and administration require granted permissions", () => {
  const restricted = createPaletteCommands({
    t,
    instances: [],
    client: client([]),
  });
  assert(
    !restricted.some(
      (command) =>
        command.group === "admin" || command.action === "create-project",
    ),
  );
  const allowed = createPaletteCommands({
    t,
    instances: [],
    client: client([
      GlobalPermission.READ_SERVER_CONFIG,
      GlobalPermission.READ_USER,
      GlobalPermission.CREATE_INSTANCE,
    ]),
  });
  assert(allowed.some((command) => command.id === "create-project"));
  assert(allowed.some((command) => command.id === "admin-users"));
  assert(
    !allowed.some(
      (command) =>
        command.id === "admin-logs" || command.id === "admin-terminal",
    ),
  );
  const denied = client([GlobalPermission.CREATE_INSTANCE]);
  denied.serverPermissions[0].granted = false;
  assert(
    !createPaletteCommands({ t, instances: [], client: denied }).some(
      (command) => command.id === "create-project",
    ),
  );
});

test("current project indexes bot identities, scripts, and setting labels without values", () => {
  const commands = createPaletteCommands({
    t,
    instances: [project(current.id)],
    current,
    scripts: [
      create(ScriptInfoSchema, {
        id: "script-1",
        name: "Reconnect test",
        description: "Connection recovery",
      }),
    ],
  });
  assert.equal(
    searchPaletteCommands(commands, "movement interval")[0]?.id,
    'setting:farm-1:["anti-afk","anti-afk","interval"]',
  );
  assert.equal(
    searchPaletteCommands(commands, "idle-plugin")[0]?.id,
    "settings:farm-1:anti-afk",
  );
  assert.equal(searchPaletteCommands(commands, "private-value").length, 0);
  assert.deepEqual(
    commands.find((command) => command.id === "bot:farm-1:bot-id")?.destination,
    {
      to: "/instance/$instance/bot/$botId",
      params: { instance: "farm-1", botId: "bot-id" },
    },
  );
  assert.equal(
    searchPaletteCommands(commands, "recovery")[0]?.id,
    "script:farm-1:script-1",
  );
  assert(commands.some((command) => command.group === "currentProject"));
});

test("removed projects and revoked access cannot reappear through cached detail or recents", () => {
  const previous = createPaletteCommands({
    t,
    instances: [project(current.id)],
    current,
  });
  const recentIds = ["bot:farm-1:bot-id", "project:farm-1"];
  assert.equal(resolvePaletteRecents(previous, recentIds).length, 2);
  for (const instances of [[], [project(current.id)]]) {
    const commands = createPaletteCommands({
      t,
      instances,
      current: { ...current, instancePermissions: [] },
    });
    assert.equal(resolvePaletteRecents(commands, recentIds).length, 0);
    assert(
      !commands.some((command) => command.context === current.friendlyName),
    );
  }
});

test("fuzzy search matches case, accents, aliases, and multiple words in either order", () => {
  const commands = createPaletteCommands({
    t,
    instances: [
      project("farm-1", [
        InstancePermission.READ_INSTANCE,
        InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
      ]),
    ],
  });
  for (const query of ["farm console", "CONSOLE FARM", "frm trmnl"]) {
    assert.equal(
      searchPaletteCommands(commands, query)[0]?.id,
      "terminal:farm-1",
    );
  }
  const accented = { ...commands[0], label: "Café" };
  assert.equal(searchPaletteCommands([accented], "cafe").length, 1);
  assert.equal(
    searchPaletteCommands(commands, "nothing-matches-9xqz").length,
    0,
  );
  assert.deepEqual(searchPaletteCommands(commands, "  "), commands);
});

test("recents are deduplicated, bounded, validated, and resolved from the current catalog", () => {
  let ids: string[] = [];
  for (let index = 0; index < 10; index++)
    ids = rememberPaletteCommand(ids, `project:${index}`);
  ids = rememberPaletteCommand(ids, "project:5");
  assert.equal(ids.length, 8);
  assert.equal(ids[0], "project:5");
  assert.equal(ids.filter((id) => id === "project:5").length, 1);
  assert.deepEqual(
    readPaletteRecents(
      { getItem: () => '["projects",42,"projects","about"]' },
      "key",
    ),
    ["projects", "about"],
  );
  for (const value of ["not json", "null", "{}", "123"])
    assert.deepEqual(readPaletteRecents({ getItem: () => value }, "key"), []);
  assert.deepEqual(
    readPaletteRecents(
      {
        getItem: () => {
          throw new Error("Storage denied");
        },
      },
      "key",
    ),
    [],
  );
  const commands = createPaletteCommands({ t, instances: [] });
  assert.deepEqual(
    resolvePaletteRecents(commands, ["about", "missing", "projects"]).map(
      (command) => command.id,
    ),
    ["projects"],
  );
});

test("the global shortcut accepts Ctrl or Command and ignores composition, repeats, and other modifiers", () => {
  const event = {
    key: "k",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  };
  assert.equal(isPaletteShortcut(event), false);
  assert.equal(isPaletteShortcut({ ...event, ctrlKey: true }), true);
  assert.equal(isPaletteShortcut({ ...event, metaKey: true, key: "K" }), true);
  for (const modifier of [
    "altKey",
    "shiftKey",
    "repeat",
    "isComposing",
  ] as const)
    assert.equal(
      isPaletteShortcut({ ...event, ctrlKey: true, [modifier]: true }),
      false,
    );
});

test("individual setting results link to an exact field rather than only its page", () => {
  const commands = createPaletteCommands({
    t,
    instances: [project(current.id)],
    current,
  });
  const result = searchPaletteCommands(commands, "movement interval")[0];
  assert.equal(result.label, "Movement interval");
  assert.equal(result.description, "Prevent idle kicks");
  assert.deepEqual(result.destination, {
    to: "/instance/$instance/settings/$pageId",
    params: { instance: current.id, pageId: "anti-afk" },
    search: { focusNamespace: "anti-afk", focusKey: "interval" },
  });
});

test("exact names outrank aliases and context, with current project and recency breaking ties", () => {
  const base = createPaletteCommands({ t, instances: [] })[0];
  const alias = {
    ...base,
    id: "alias",
    label: "Logs",
    keywords: ["Terminal"],
    projectId: "current",
  };
  const exact = {
    ...base,
    id: "exact",
    label: "Terminal",
    projectId: "elsewhere",
  };
  assert.equal(
    searchPaletteCommands([alias, exact], "terminal", {
      currentProjectId: "current",
      recentIds: ["alias"],
    })[0].id,
    "exact",
  );
  assert.equal(
    searchPaletteCommands([alias], "terminal")[0].matchedText,
    "Terminal",
  );
  const duplicate = { ...exact, id: "other", projectId: "current" };
  assert.equal(
    searchPaletteCommands([exact, duplicate], "terminal", {
      currentProjectId: "current",
    })[0].id,
    "other",
  );
  assert.equal(
    searchPaletteCommands([exact, { ...exact, id: "recent" }], "terminal", {
      recentIds: ["recent"],
    })[0].id,
    "recent",
  );
});

test("highlight spans preserve accents, Unicode, and literal text", () => {
  assert.deepEqual(paletteMatchSegments("Café settings", "cafe"), [
    { text: "Café", matched: true },
    { text: " settings", matched: false },
  ]);
  for (const text of [
    "Cafe\u0301 settings",
    "Bot 🧪",
    "<script>alert(1)</script>",
  ]) {
    const segments = paletteMatchSegments(text, "bot");
    assert.equal(segments.map((segment) => segment.text).join(""), text);
  }
  assert.deepEqual(
    paletteMatchSegments("Terminal", "trmnl")
      .filter((segment) => segment.matched)
      .map((segment) => segment.text)
      .join(""),
    "Trmnl",
  );
});

test("bot and script operations require control permissions and never include empty targets", () => {
  const denied = createPaletteCommands({
    t,
    instances: [project(current.id)],
    current,
  });
  assert(!denied.some((command) => command.operation));
  const authorized = {
    ...current,
    instancePermissions: [
      ...current.instancePermissions,
      ...[
        InstancePermission.CONTROL_BOTS,
        InstancePermission.EXECUTE_SCRIPTS,
      ].map((instancePermission) => ({
        $typeName: "soulfire.v1.InstancePermissionState" as const,
        instancePermission,
        granted: true,
      })),
    ],
    profile: {
      ...current.profile,
      accounts: [
        ...current.profile.accounts,
        {
          ...current.profile.accounts[0],
          profileId: "stopped",
          lastKnownName: "Stopped",
        },
        {
          ...current.profile.accounts[0],
          profileId: "failed",
          lastKnownName: "Failed",
        },
      ],
    },
  };
  const commands = createPaletteCommands({
    t,
    instances: [project(current.id)],
    current: authorized,
    bots: [
      create(BotListEntrySchema, {
        profileId: "bot-id",
        isOnline: true,
        status: { desiredState: BotDesiredState.RUNNING },
      }),
      create(BotListEntrySchema, {
        profileId: "failed",
        status: {
          desiredState: BotDesiredState.RUNNING,
          runtimeState: BotRuntimeState.FAILED,
        },
      }),
    ],
    scripts: [
      create(ScriptInfoSchema, {
        id: "script-1",
        name: "Recover",
        paused: true,
      }),
    ],
  });
  assert.deepEqual(
    commands.find((command) => command.id === `start-bots:${current.id}`)
      ?.operation,
    {
      kind: "bot",
      action: "start",
      instanceId: current.id,
      botIds: ["stopped"],
    },
  );
  assert.deepEqual(
    commands.find((command) => command.id === `retry-bots:${current.id}`)
      ?.operation,
    {
      kind: "bot",
      action: "restart",
      instanceId: current.id,
      botIds: ["failed"],
    },
  );
  assert.equal(
    commands.find((command) => command.id === `start-bots:${current.id}`)
      ?.label,
    "Start 1 bot",
  );
  assert.deepEqual(
    commands.find(
      (command) => command.id === `activate-script:${current.id}:script-1`,
    )?.operation,
    {
      kind: "script",
      action: "activate",
      instanceId: current.id,
      scriptId: "script-1",
    },
  );
  assert.equal(
    commands.find((command) => command.id === `bot:${current.id}:bot-id`)
      ?.status?.label,
    "Connected",
  );
  assert.equal(
    commands.find((command) => command.id === `script:${current.id}:script-1`)
      ?.status?.label,
    "Paused",
  );
  assert(
    !commands.some(
      (command) =>
        command.operation?.kind === "bot" &&
        command.operation.botIds.length === 0,
    ),
  );
});

test("type filters overlap by meaning and every readable project can be browsed", () => {
  const commands = createPaletteCommands({
    t,
    client: client([]),
    instances: [project(current.id), project("farm-2"), project("hidden", [])],
    current: {
      ...current,
      instancePermissions: [
        ...current.instancePermissions,
        {
          $typeName: "soulfire.v1.InstancePermissionState" as const,
          instancePermission: InstancePermission.CONTROL_BOTS,
          granted: true,
        },
      ],
    },
  });
  const ids = (filter: Parameters<typeof matchesPaletteFilter>[1]) =>
    commands
      .filter((command) => matchesPaletteFilter(command, filter))
      .map((command) => command.id);
  assert.deepEqual(
    commands
      .filter((command) => command.action === "browse-project")
      .map((command) => [command.id, command.projectId]),
    [
      [`browse-project:${current.id}`, current.id],
      ["browse-project:farm-2", "farm-2"],
    ],
  );
  assert(ids("bots").includes(`bot:${current.id}:bot-id`));
  assert(ids("bots").includes(`stop-bot:${current.id}:bot-id`));
  assert(ids("actions").includes(`stop-bot:${current.id}:bot-id`));
  assert(!ids("actions").includes(`bot:${current.id}:bot-id`));
  assert(ids("projects").includes("browse-project:farm-2"));
  assert(ids("projects").includes("project:farm-2"));
  assert(!ids("projects").includes("theme-dark"));
  assert(ids("settings").every((id) => id.startsWith("setting")));
  assert.equal(ids("all").length, commands.length);
});

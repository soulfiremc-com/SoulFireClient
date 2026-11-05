import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { createInstance } from "i18next";
import common from "../../locales/en-US/common.json";
import { ClientDataResponseSchema } from "@/generated/soulfire/client_pb";
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
  readPaletteRecents,
  rememberPaletteCommand,
  resolvePaletteRecents,
  searchPaletteCommands,
} from "./command-palette";
import type { InstanceInfoQueryData } from "./types";

const i18n = createInstance();
void i18n.init({
  lng: "en-US",
  resources: { "en-US": { common } },
  defaultNS: "common",
  initAsync: false,
});
const t = (key: string) => i18n.t(key);
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
    "settings:farm-1:anti-afk",
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

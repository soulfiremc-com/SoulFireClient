import assert from "node:assert/strict";
import { test } from "node:test";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import {
  demoClientData,
  demoInstancePermissions,
  demoInstancePlugins,
  demoInstanceSettings,
  demoInstanceSettingsDefinitions,
  demoServerSettings,
  demoServerSettingsDefinitions,
} from "./demo-data.ts";
import {
  GlobalPermission,
  InstancePermission,
} from "./generated/soulfire/common_pb.ts";
import { InstanceInfoSchema } from "./generated/soulfire/instance_pb.ts";

const catalogs = [
  { pages: demoInstanceSettings, definitions: demoInstanceSettingsDefinitions },
  { pages: demoServerSettings, definitions: demoServerSettingsDefinitions },
];

test("demo settings use distinct icons for the built-in pages", () => {
  const expectedIcons = {
    bot: "bot",
    account: "users",
    proxy: "waypoints",
    ai: "sparkles",
    pathfinding: "route",
    server: "server",
    dev: "code",
  };
  for (const { pages } of catalogs) {
    for (const page of pages) {
      assert.ok(page.iconId in dynamicIconImports, page.id);
      if (page.id in expectedIcons) {
        assert.equal(
          page.iconId,
          expectedIcons[page.id as keyof typeof expectedIcons],
          page.id,
        );
      }
    }
  }
});

test("demo plugin pages have metadata and enabled definitions for discovery", () => {
  const pages = demoInstanceSettings.filter((page) => page.owningPluginId);
  assert.deepEqual(
    pages.map((page) => page.id),
    ["chat-logger", "disconnect-logger"],
  );
  for (const page of pages) {
    const plugin = demoInstancePlugins.find(
      (plugin) => plugin.id === page.owningPluginId,
    );
    assert.ok(plugin, page.id);
    assert.ok(
      plugin.description && plugin.version && plugin.author && plugin.license,
    );
    const enabled = page.enabledIdentifier;
    assert.ok(enabled, page.id);
    const definition = demoInstanceSettingsDefinitions.find(
      (definition) =>
        definition.id?.namespace === enabled.namespace &&
        definition.id.key === enabled.key,
    );
    assert.equal(definition?.type.case, "bool", page.id);
    if (definition?.type.case === "bool") {
      assert.equal(definition.type.value.def, true, page.id);
    }
  }
});

test("every demo setting is reachable and every page entry has a definition", () => {
  for (const { pages, definitions } of catalogs) {
    const definitionKeys = definitions.map(
      (definition) => `${definition.id?.namespace}:${definition.id?.key}`,
    );
    const entryKeys = pages.flatMap((page) =>
      page.entries.map((entry) => `${entry.namespace}:${entry.key}`),
    );
    assert.equal(new Set(definitionKeys).size, definitionKeys.length);
    assert.equal(new Set(entryKeys).size, entryKeys.length);
    assert.deepEqual(new Set(entryKeys), new Set(definitionKeys));
  }
});

test("demo defaults are valid options and stay within numeric limits", () => {
  for (const { definitions } of catalogs) {
    for (const definition of definitions) {
      const { type } = definition;
      const name = `${definition.id?.namespace}:${definition.id?.key}`;
      if (type.case === "combo") {
        assert.ok(
          type.value.options.some((option) => option.id === type.value.def),
          name,
        );
        for (const option of type.value.options) {
          assert.ok(
            !option.iconId || option.iconId in dynamicIconImports,
            name,
          );
        }
      } else if (type.case === "int" || type.case === "double") {
        assert.ok(type.value.def >= type.value.min, name);
        assert.ok(type.value.def <= type.value.max, name);
      } else if (type.case === "minMax") {
        assert.ok(type.value.minEntry && type.value.maxEntry, name);
        assert.ok(type.value.minEntry.def >= type.value.min, name);
        assert.ok(type.value.minEntry.def <= type.value.maxEntry.def, name);
        assert.ok(type.value.maxEntry.def <= type.value.max, name);
      }
    }
  }
});

test("demo grants contain each numeric permission once", () => {
  for (const { values, permissions } of [
    {
      values: GlobalPermission,
      permissions: demoClientData.serverPermissions.map(
        (grant) => grant.globalPermission,
      ),
    },
    {
      values: InstancePermission,
      permissions: demoInstancePermissions.map(
        (grant) => grant.instancePermission,
      ),
    },
  ]) {
    assert.ok(
      permissions.every((permission) => typeof permission === "number"),
    );
    assert.equal(permissions.length, new Set<number>(permissions).size);
    assert.deepEqual(
      new Set<number>(permissions),
      new Set(
        Object.values(values).filter((value) => typeof value === "number"),
      ),
    );
  }
});

test("demo settings and plugin metadata survive protocol serialization", () => {
  const info = create(InstanceInfoSchema, {
    instanceSettings: demoInstanceSettings,
    settingsDefinitions: demoInstanceSettingsDefinitions,
    plugins: demoInstancePlugins,
    instancePermissions: demoInstancePermissions,
  });
  const decoded = fromBinary(
    InstanceInfoSchema,
    toBinary(InstanceInfoSchema, info),
  );
  assert.deepEqual(decoded, info);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  SettingsDefinitionSchema,
  SettingsPageSchema,
} from "@/generated/soulfire/common_pb";
import {
  classifyPluginTask,
  filterSettingsEntries,
  findSettingsOnOtherPages,
  getPluginSearchText,
  splitSettingsEntries,
} from "./settings-discovery.ts";

const id = (namespace: string, key: string) => ({ namespace, key });
const stringSetting = (namespace: string, key: string, uiName: string) =>
  create(SettingsDefinitionSchema, {
    id: id(namespace, key),
    type: {
      case: "string",
      value: { uiName, description: `${uiName} description` },
    },
  });

test("common settings come first and new server settings stay reachable", () => {
  const list = [
    id("bot", "address"),
    id("bot", "new-server-option"),
  ] as never[];
  const split = splitSettingsEntries("bot", list);
  assert.deepEqual(
    split.common.map((e) => e.key),
    ["address"],
  );
  assert.deepEqual(
    split.advanced.map((e) => e.key),
    ["new-server-option"],
  );
});

test("pages without a curated list show everything", () => {
  const list = [id("my-plugin", "a"), id("my-plugin", "b")] as never[];
  const split = splitSettingsEntries("my-plugin", list);
  assert.equal(split.common.length, 2);
  assert.equal(split.advanced.length, 0);
});

test("search matches names and descriptions from server definitions", () => {
  const defs = [
    stringSetting("bot", "address", "Address"),
    stringSetting("bot", "brand", "Client brand"),
  ];
  const entries = [id("bot", "address"), id("bot", "brand")] as never[];
  assert.deepEqual(
    filterSettingsEntries(entries, defs, "client").map((e) => e.key),
    ["brand"],
  );
  assert.equal(filterSettingsEntries(entries, defs, "  ").length, 2);
  assert.equal(filterSettingsEntries(entries, defs, "nothing").length, 0);
});

test("search reports matches on other pages", () => {
  const defs = [stringSetting("ai", "model", "AI model")];
  const pages = [
    create(SettingsPageSchema, { id: "bot", entries: [] }),
    create(SettingsPageSchema, { id: "ai", entries: [id("ai", "model")] }),
  ];
  const found = findSettingsOnOtherPages("bot", pages, defs, "model");
  assert.equal(found[0]?.page.id, "ai");
  assert.equal(found[0]?.count, 1);
  assert.deepEqual(findSettingsOnOtherPages("ai", pages, defs, "model"), []);
});

test("plugins group by task and unknown plugins stay available", () => {
  assert.equal(
    classifyPluginTask("Chat Logger logs chat messages"),
    "diagnose",
  );
  assert.equal(
    classifyPluginTask("Auto Eat keeps bots fed with food"),
    "survive",
  );
  assert.equal(classifyPluginTask("Auto Reconnect"), "connect");
  assert.equal(classifyPluginTask("AI Chat Bot"), "chat");
  assert.equal(classifyPluginTask("Something else"), "other");
});

test("renamed plugins remain searchable by familiar names and stable IDs", () => {
  for (const [id, displayName, legacyName] of [
    ["kill-aura", "Auto attack", "Kill Aura"],
    ["server-list-bypass", "Ping before join", "Server List Bypass"],
    ["fake-virtual-host", "Handshake host override", "Fake Virtual Host"],
    ["forwarding-bypass", "Player forwarding", "Forwarding Bypass"],
    ["ai-chat-bot", "AI chat", "AI Chat Bot"],
  ]) {
    const text = getPluginSearchText(displayName, {
      id,
      description: "Server-provided behavior description",
    });
    assert.ok(text.includes(displayName.toLowerCase()));
    assert.ok(text.includes(id));
    assert.ok(text.includes(legacyName.toLowerCase()));
    assert.ok(text.includes(id.replace(/-/g, "")));
    assert.ok(text.includes("server-provided behavior description"));
  }
});

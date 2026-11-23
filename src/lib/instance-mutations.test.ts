import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { QueryClient } from "@tanstack/react-query";
import { BotService } from "@/generated/soulfire/bot_pb";
import { MinecraftAccountProto_AccountTypeProto } from "@/generated/soulfire/common_pb";
import {
  InstanceInfoSchema,
  type InstanceListResponse,
  InstanceListResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import {
  convertFromInstanceProto,
  type InstanceInfoQueryData,
  type ProfileAccount,
  toSettingsNamespace,
} from "@/lib/types.ts";
import {
  DemoReadOnlyError,
  removeBotConfigEntry,
  removeInstanceAccountsBatch,
  setInstanceFriendlyName,
  updateBotConfigEntry,
} from "./instance-mutations.ts";

const instanceId = "instance";
const infoKey = ["instance-info", instanceId];
const listKey = ["instance-list"];
const botId = "bot";

function account(profileId: string): ProfileAccount {
  return {
    type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
    profileId,
    lastKnownName: profileId,
    accountData: { case: undefined },
    config: [],
    persistentMetadata: [],
  };
}

function cachedInfo(friendlyName = "Before"): InstanceInfoQueryData {
  return {
    ...create(InstanceInfoSchema, { friendlyName, icon: "pickaxe" }),
    id: instanceId,
    profile: {
      settings: {},
      accounts: [account(botId), account("other")],
      proxies: [],
    },
  };
}

function instanceTransport(onUpdate: () => void) {
  return createRouterTransport((router) => {
    router.service(InstanceService, {
      updateInstanceMeta() {
        onUpdate();
        return {};
      },
      removeInstanceAccountsBatch() {
        onUpdate();
        return {};
      },
    });
    router.service(BotService, {
      updateBotConfigEntry() {
        onUpdate();
        return {};
      },
      deleteBotConfigEntry() {
        onUpdate();
        return {};
      },
    });
  });
}

test("a poll that started before the write cannot replace the optimistic edit", async () => {
  const client = new QueryClient();
  try {
    client.setQueryData(infoKey, cachedInfo());
    let releasePoll!: () => void;
    const pollGate = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    // The poll read the server before the write, so it returns the old name.
    const poll = client
      .fetchQuery({
        queryKey: infoKey,
        queryFn: async () => {
          await pollGate;
          return cachedInfo("Before");
        },
      })
      .catch(() => undefined);

    await setInstanceFriendlyName(
      "After",
      { id: instanceId },
      instanceTransport(() => {}),
      client,
      infoKey,
      listKey,
    );
    releasePoll();
    await poll;

    assert.equal(
      client.getQueryData<InstanceInfoQueryData>(infoKey)?.friendlyName,
      "After",
    );
  } finally {
    client.clear();
  }
});

test("renaming updates the project in the cached project list", async () => {
  const client = new QueryClient();
  try {
    client.setQueryData(infoKey, cachedInfo());
    client.setQueryData(
      listKey,
      create(InstanceListResponseSchema, {
        instances: [
          { id: instanceId, friendlyName: "Before" },
          { id: "other", friendlyName: "Other" },
        ],
      }),
    );
    let calls = 0;
    await setInstanceFriendlyName(
      "After",
      { id: instanceId },
      instanceTransport(() => {
        calls++;
      }),
      client,
      infoKey,
      listKey,
    );
    assert.equal(calls, 1);
    assert.deepEqual(
      client
        .getQueryData<InstanceListResponse>(listKey)
        ?.instances.map((item) => item.friendlyName),
      ["After", "Other"],
    );
  } finally {
    client.clear();
  }
});

test("a rejected write rethrows the server error and marks the cache invalid", async () => {
  const client = new QueryClient();
  try {
    client.setQueryData(infoKey, cachedInfo());
    const transport = createRouterTransport((router) => {
      router.service(InstanceService, {
        removeInstanceAccountsBatch() {
          throw new ConnectError("Not allowed", Code.PermissionDenied);
        },
      });
    });
    await assert.rejects(
      removeInstanceAccountsBatch(
        [botId],
        { id: instanceId },
        transport,
        client,
        infoKey,
      ),
      (error) =>
        error instanceof ConnectError && error.code === Code.PermissionDenied,
    );
    // The next fetch skips the conditional request and loads server state.
    assert.equal(client.getQueryState(infoKey)?.isInvalidated, true);
  } finally {
    client.clear();
  }
});

test("a demo write throws and leaves the cache unchanged", async () => {
  const client = new QueryClient();
  try {
    const before = cachedInfo();
    client.setQueryData(infoKey, before);
    await assert.rejects(
      removeInstanceAccountsBatch(
        [botId],
        { id: instanceId },
        null,
        client,
        infoKey,
      ),
      DemoReadOnlyError,
    );
    assert.equal(client.getQueryData(infoKey), before);
  } finally {
    client.clear();
  }
});

test("bot settings are added, replaced, and removed on the bot's account only", async () => {
  const client = new QueryClient();
  try {
    client.setQueryData(infoKey, cachedInfo());
    const transport = instanceTransport(() => {});
    const botConfig = () =>
      convertFromInstanceProto({
        $typeName: "soulfire.v1.InstanceConfig",
        settings:
          client
            .getQueryData<InstanceInfoQueryData>(infoKey)
            ?.profile.accounts.find((a) => a.profileId === botId)?.config ?? [],
        accounts: [],
        proxies: [],
        persistentMetadata: [],
      }).settings;
    const save = (key: string, value: number) =>
      updateBotConfigEntry(
        "bot",
        key,
        value,
        instanceId,
        botId,
        transport,
        client,
        infoKey,
      );

    await save("join-delay", 1);
    await save("join-delay", 2);
    await save("max-bots", 5);
    assert.deepEqual(botConfig(), { bot: { "join-delay": 2, "max-bots": 5 } });

    await removeBotConfigEntry(
      "bot",
      "join-delay",
      instanceId,
      botId,
      transport,
      client,
      infoKey,
    );
    await removeBotConfigEntry(
      "bot",
      "max-bots",
      instanceId,
      botId,
      transport,
      client,
      infoKey,
    );
    assert.deepEqual(botConfig(), {});
    assert.deepEqual(
      client
        .getQueryData<InstanceInfoQueryData>(infoKey)
        ?.profile.accounts.find((a) => a.profileId === "other")?.config,
      [],
    );
  } finally {
    client.clear();
  }
});

test("a bot setting joins an existing namespace", async () => {
  const client = new QueryClient();
  try {
    const info = cachedInfo();
    info.profile.accounts[0] = {
      ...account(botId),
      config: [toSettingsNamespace("bot", { "join-delay": 1 })],
    };
    client.setQueryData(infoKey, info);
    await updateBotConfigEntry(
      "bot",
      "max-bots",
      5,
      instanceId,
      botId,
      instanceTransport(() => {}),
      client,
      infoKey,
    );
    const config =
      client.getQueryData<InstanceInfoQueryData>(infoKey)?.profile.accounts[0]
        ?.config;
    assert.deepEqual(
      config?.map((ns) => [ns.namespace, ns.entries.map((e) => e.key)]),
      [["bot", ["join-delay", "max-bots"]]],
    );
  } finally {
    client.clear();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProtoSchema,
  ProxyProto_Type,
} from "@/generated/soulfire/common_pb";
import { ServerConfigSchema } from "@/generated/soulfire/server_pb";
import {
  convertFromInstanceProto,
  convertFromServerProto,
  convertToInstanceProto,
  type ProfileRoot,
} from "./types.ts";

const settings: ProfileRoot["settings"] = {
  bot: {
    name: "Grüße 世界",
    amount: 42,
    ratio: 0.5,
    enabled: false,
    nothing: null,
    servers: ["a.example", "b.example"],
    delay: { min: 1000, max: 3000 },
  },
  "empty-namespace": {},
};

test("instance settings, accounts and proxies survive a proto round trip", () => {
  const profile: ProfileRoot = {
    settings,
    accounts: [
      create(MinecraftAccountProtoSchema, {
        type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
        profileId: "f28a1b36-af69-3240-a72c-3d71b301a750",
        lastKnownName: "OfflineQA",
        accountData: { case: "offlineJavaData", value: {} },
      }),
    ],
    proxies: [
      {
        type: ProxyProto_Type.SOCKS5,
        address: "127.0.0.1:1080",
        username: "user",
        password: "secret",
      },
      { type: ProxyProto_Type.HTTP, address: "127.0.0.1:8080" },
    ],
  };

  const roundTrip = convertFromInstanceProto(convertToInstanceProto(profile));

  assert.deepEqual(roundTrip.settings, settings);
  assert.deepEqual(
    roundTrip.accounts.map(({ lastKnownName, accountData }) => ({
      lastKnownName,
      accountData: accountData.case,
    })),
    [{ lastKnownName: "OfflineQA", accountData: "offlineJavaData" }],
  );
  assert.deepEqual(
    roundTrip.proxies.map(({ type, address, username, password }) => ({
      type,
      address,
      username,
      password,
    })),
    [
      {
        type: ProxyProto_Type.SOCKS5,
        address: "127.0.0.1:1080",
        username: "user",
        password: "secret",
      },
      {
        type: ProxyProto_Type.HTTP,
        address: "127.0.0.1:8080",
        username: undefined,
        password: undefined,
      },
    ],
  );
});

test("a missing instance config reads as an empty profile", () => {
  assert.deepEqual(convertFromInstanceProto(undefined), {
    settings: {},
    accounts: [],
    proxies: [],
  });
});

test("server settings use the same value conversion as instance settings", () => {
  const instance = convertToInstanceProto({
    settings,
    accounts: [],
    proxies: [],
  });
  const server = create(ServerConfigSchema, { settings: instance.settings });
  assert.deepEqual(convertFromServerProto(server), { settings });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { create, equals } from "@bufbuild/protobuf";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProtoSchema,
  ProxyProto_Type,
} from "@/generated/soulfire/common_pb";
import { InstanceConfigSchema } from "@/generated/soulfire/instance_pb";
import { convertToInstanceProto, type ProfileRoot } from "@/lib/types";
import { parseProfileFile, serializeProfileFile } from "./profile-file";

function profile(expireTimeMs: bigint): ProfileRoot {
  return {
    settings: { example: { text: "Grüße 世界", count: 42, enabled: false } },
    proxies: [
      {
        type: ProxyProto_Type.SOCKS5,
        address: "inet://[::1]:1080",
        username: "qa:@",
        password: "qa-test-password",
      },
    ],
    accounts: [
      create(MinecraftAccountProtoSchema, {
        type: MinecraftAccountProto_AccountTypeProto.MICROSOFT_JAVA_ACCESS_TOKEN,
        profileId: "580e3304-6232-481c-a5c6-64409f046177",
        lastKnownName: "TransferQA",
        accountData: {
          case: "onlineSimpleJavaData",
          value: { accessToken: "qa-not-a-real-access-token", expireTimeMs },
        },
        config: [
          {
            namespace: "qa",
            entries: [
              {
                key: "name",
                value: { kind: { case: "stringValue", value: "世界" } },
              },
            ],
          },
        ],
        persistentMetadata: [
          {
            namespace: "qa",
            entries: [
              {
                key: "visited",
                value: { kind: { case: "boolValue", value: true } },
              },
            ],
          },
        ],
      }),
      create(MinecraftAccountProtoSchema, {
        type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
        profileId: "f28a1b36-af69-3240-a72c-3d71b301a750",
        lastKnownName: "OfflineQA",
        accountData: { case: "offlineJavaData", value: {} },
      }),
    ],
  };
}

test("profile files preserve exact token expiries and the complete configuration", () => {
  for (const expiry of [0n, 1_700_000_000_123n, 9_223_372_036_854_775_807n]) {
    const original = profile(expiry);
    const text = serializeProfileFile(original);
    assert.equal(
      JSON.parse(text).accounts[0].accountData.value.expireTimeMs,
      expiry.toString(),
    );
    const imported = parseProfileFile(text);
    assert.deepEqual(imported, original);
    assert.ok(
      equals(
        InstanceConfigSchema,
        convertToInstanceProto(imported),
        convertToInstanceProto(original),
      ),
    );
  }
});

test("existing profile files and numeric token expiries remain importable", () => {
  const legacy = profile(0n);
  legacy.accounts.shift();
  assert.deepEqual(parseProfileFile(JSON.stringify(legacy)), legacy);

  const numericExpiry = JSON.parse(serializeProfileFile(profile(123n)));
  numericExpiry.accounts[0].accountData.value.expireTimeMs = 123;
  assert.deepEqual(
    parseProfileFile(JSON.stringify(numericExpiry)),
    profile(123n),
  );
});

test("invalid token expiries fail before a profile can be submitted", () => {
  for (const expiry of ["not-a-number", "1.5", "9223372036854775808"]) {
    const invalid = JSON.parse(serializeProfileFile(profile(0n)));
    invalid.accounts[0].accountData.value.expireTimeMs = expiry;
    assert.throws(() => parseProfileFile(JSON.stringify(invalid)));
  }
});

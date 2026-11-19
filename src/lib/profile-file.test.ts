import assert from "node:assert/strict";
import { test } from "node:test";
import { create, equals } from "@bufbuild/protobuf";
import { Schema } from "effect";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProtoSchema,
  ProxyProto_Type,
  SettingsNamespaceSchema,
} from "@/generated/soulfire/common_pb";
import { InstanceConfigSchema } from "@/generated/soulfire/instance_pb";
import {
  convertFromInstanceProto,
  convertToInstanceProto,
  type ProfileRoot,
} from "@/lib/types";
import { parseProfileFile, serializeProfileFile } from "./profile-file";

const decodeJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.MutableJson),
);

function isJsonObject(
  value: Schema.MutableJson | undefined,
): value is Schema.MutableJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the token of the first account in a serialized profile. */
function firstAccountToken(
  profileJson: Schema.MutableJson,
): Schema.MutableJsonObject {
  const accounts = isJsonObject(profileJson)
    ? profileJson["accounts"]
    : undefined;
  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  const accountData = isJsonObject(account)
    ? account["accountData"]
    : undefined;
  const token = isJsonObject(accountData) ? accountData["value"] : undefined;
  assert.ok(isJsonObject(token), "The profile has no account token");
  return token;
}

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
      firstAccountToken(decodeJson(text))["expireTimeMs"],
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

  const numericExpiry = decodeJson(serializeProfileFile(profile(123n)));
  firstAccountToken(numericExpiry)["expireTimeMs"] = 123;
  assert.deepEqual(
    parseProfileFile(JSON.stringify(numericExpiry)),
    profile(123n),
  );
});

test("invalid token expiries fail before a profile can be submitted", () => {
  for (const expiry of ["not-a-number", "1.5", "9223372036854775808"]) {
    const invalid = decodeJson(serializeProfileFile(profile(0n)));
    firstAccountToken(invalid)["expireTimeMs"] = expiry;
    assert.throws(() => parseProfileFile(JSON.stringify(invalid)));
  }
});

test("configuration export retains credentials and account metadata, but omits project metadata", () => {
  const source = convertToInstanceProto(profile(123n));
  source.persistentMetadata = [
    create(SettingsNamespaceSchema, { namespace: "project-metadata" }),
  ];
  const serialized = serializeProfileFile(convertFromInstanceProto(source));
  const exported = parseProfileFile(serialized);

  assert.deepEqual(
    exported.accounts[0]?.accountData,
    source.accounts[0]?.accountData,
  );
  assert.deepEqual(
    exported.accounts[0]?.persistentMetadata,
    source.accounts[0]?.persistentMetadata,
  );
  assert.equal(exported.proxies[0]?.password, "qa-test-password");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      JSON.parse(serialized),
      "persistentMetadata",
    ),
    false,
  );
});

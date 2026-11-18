import { create, type JsonValue } from "@bufbuild/protobuf";
import {
  type MinecraftAccountProto,
  type MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProtoSchema,
  type ProxyProto,
  type ProxyProto_Type,
  ProxyProtoSchema,
  type SettingsNamespace,
  SettingsNamespace_SettingsEntrySchema,
  SettingsNamespaceSchema,
} from "@/generated/soulfire/common_pb";
import {
  type InstanceConfig,
  InstanceConfigSchema,
  type InstanceInfo,
} from "@/generated/soulfire/instance_pb";
import type {
  ServerConfig,
  ServerInfoResponse,
} from "@/generated/soulfire/server_pb";
import { jsonToValue, valueToJson } from "@/lib/protobuf.ts";

export const SF_SERVER_TYPES = ["integrated", "dedicated"] as const;
export type SFServerType = (typeof SF_SERVER_TYPES)[number];

export type BaseSettings = {
  settings: Record<string, Record<string, JsonValue>>;
};

export type ProfileRoot = BaseSettings & {
  accounts: ProfileAccount[];
  proxies: ProfileProxy[];
};

export const GENERATE_ACCOUNTS_MODES = [
  "IGNORE_EXISTING",
  "REPLACE_EXISTING",
  "REPLACE_ALL",
] as const;
export type GenerateAccountsMode = (typeof GENERATE_ACCOUNTS_MODES)[number];

export type ServerInfoQueryData = ServerInfoResponse & {
  profile: BaseSettings;
};

export type InstanceInfoQueryData = InstanceInfo & {
  id: string;
  profile: ProfileRoot;
};

export function getEnumKeyByValue<E extends object>(
  enumObj: E,
  value: E[keyof E],
): keyof E {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic enum helpers cannot express that Object.entries keys and values belong to the enum type
  return Object.entries(enumObj).find(([, v]) => v === value)?.[0] as keyof E;
}

export function getEnumEntries<E extends object>(
  enumObj: E,
): {
  key: keyof E;
  value: E[keyof E];
}[] {
  return Object.entries(enumObj)
    .filter(([key]) => Number.isNaN(parseInt(key, 10)))
    .map(([key, value]) => ({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic enum helpers cannot express that Object.entries keys and values belong to the enum type
      key: key as keyof E,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic enum helpers cannot express that Object.entries keys and values belong to the enum type
      value: value as E[keyof E],
    }));
}

export function mapUnionToValue<U, V>(
  union: U,
  map: (u: U) => Exclude<V, void>,
): V {
  return map(union);
}

export type ProfileAccount = {
  type: MinecraftAccountProto_AccountTypeProto;
  profileId: string;
  lastKnownName: string;
  accountData: MinecraftAccountProto["accountData"];
  config: SettingsNamespace[];
  persistentMetadata: SettingsNamespace[];
};

export type ProfileProxy = {
  type: ProxyProto_Type;
  address: string;
  username?: string | undefined;
  password?: string | undefined;
};

export function toSettingsNamespace(
  namespace: string,
  entries: Record<string, JsonValue>,
): SettingsNamespace {
  return create(SettingsNamespaceSchema, {
    namespace,
    entries: Object.entries(entries).map(([key, value]) =>
      create(SettingsNamespace_SettingsEntrySchema, {
        key,
        value: jsonToValue(value),
      }),
    ),
  });
}

export function toMinecraftAccountProto(
  account: ProfileAccount,
): MinecraftAccountProto {
  return create(MinecraftAccountProtoSchema, account);
}

export function toProxyProto(proxy: ProfileProxy): ProxyProto {
  return create(ProxyProtoSchema, proxy);
}

export function convertToInstanceProto(data: ProfileRoot): InstanceConfig {
  return create(InstanceConfigSchema, {
    settings: Object.entries(data.settings).map(([key, value]) =>
      toSettingsNamespace(key, value),
    ),
    accounts: data.accounts.map(toMinecraftAccountProto),
    proxies: data.proxies.map(toProxyProto),
    persistentMetadata: [],
  });
}

export function convertFromInstanceProto(data?: InstanceConfig): ProfileRoot {
  if (!data) {
    return {
      settings: {},
      accounts: [],
      proxies: [],
    };
  }

  const settings: Record<string, Record<string, JsonValue>> = {};
  for (const namespace of data.settings) {
    const entries: Record<string, JsonValue> = {};
    for (const entry of namespace.entries) {
      entries[entry.key] = valueToJson(entry.value);
    }
    settings[namespace.namespace] = entries;
  }

  return {
    settings: settings,
    accounts: data.accounts,
    proxies: data.proxies,
  };
}

export function convertFromServerProto(data: ServerConfig): BaseSettings {
  const settings: Record<string, Record<string, JsonValue>> = {};
  for (const namespace of data.settings) {
    const entries: Record<string, JsonValue> = {};
    for (const entry of namespace.entries) {
      entries[entry.key] = valueToJson(entry.value);
    }
    settings[namespace.namespace] = entries;
  }

  return {
    settings: settings,
  };
}

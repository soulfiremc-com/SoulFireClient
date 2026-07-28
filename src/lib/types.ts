import { create, type JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
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
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  type InstanceConfig,
  InstanceConfigSchema,
  type InstanceInfo,
} from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import type {
  ServerConfig,
  ServerInfoResponse,
} from "@soulfiremc/sdk/generated/soulfire/server_pb";
import { jsonToValue, valueToJson } from "@/lib/protobuf.ts";

export type SFServerType = "integrated" | "dedicated";

export type BaseSettings = {
  settings: Record<string, Record<string, JsonValue>>;
};

export type ProfileRoot = BaseSettings & {
  accounts: ProfileAccount[];
  proxies: ProfileProxy[];
};

export type GenerateAccountsMode =
  | "IGNORE_EXISTING"
  | "REPLACE_EXISTING"
  | "REPLACE_ALL";

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
      key: key as keyof E,
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
  username?: string;
  password?: string;
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
      entries[entry.key] = valueToJson(entry.value as Value);
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
      entries[entry.key] = valueToJson(entry.value as Value);
    }
    settings[namespace.namespace] = entries;
  }

  return {
    settings: settings,
  };
}

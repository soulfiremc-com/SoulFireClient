import { create, type JsonValue } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { createClient, type Transport } from "@connectrpc/connect";
import { BotService } from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import type { ClientDataResponse } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import { ClientService } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import type {
  GlobalPermission,
  InstancePermission,
  MinecraftAccountProto,
  ProxyProto,
  SettingsDefinition,
  SettingsEntryIdentifier,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { SettingsNamespace_SettingsEntrySchema } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import type {
  InstanceInfo,
  InstanceListResponse,
  InstanceListResponse_Instance,
} from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import {
  InstanceListResponseSchema,
  InstanceService,
} from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import { ServerService } from "@soulfiremc/sdk/generated/soulfire/server_pb";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { type ClassValue, clsx } from "clsx";
import type { FlagComponent } from "country-flag-icons/react/1x1";
import * as Flags from "country-flag-icons/react/3x2";
import { sha256 } from "js-sha256";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { desktop } from "@/lib/desktop.ts";
import { jsonToValue } from "@/lib/protobuf.ts";
import {
  type BaseSettings,
  convertToInstanceProto,
  type GenerateAccountsMode,
  type InstanceInfoQueryData,
  type ProfileAccount,
  type ProfileProxy,
  type ProfileRoot,
  type ServerInfoQueryData,
  toMinecraftAccountProto,
  toProxyProto,
  toSettingsNamespace,
} from "@/lib/types.ts";

export const ROOT_USER_ID = "00000000-0000-0000-0000-000000000000";
const LOCAL_STORAGE_TERMINAL_THEME_KEY = "terminal-theme";
const LOCAL_STORAGE_DEMO_MODE_KEY = "demo-mode";

const emojiMap = APP_LOCALES.split(",").reduce<Record<string, FlagComponent>>(
  (acc, locale) => {
    const countryCode = locale.split("-")[1];
    if (!countryCode) return acc;

    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: we need dynamic access here
    acc[countryCode] = Flags[countryCode as keyof typeof Flags];
    return acc;
  },
  {},
);

export function setTerminalTheme(theme: string) {
  localStorage.setItem(LOCAL_STORAGE_TERMINAL_THEME_KEY, theme);
}

export function getTerminalTheme() {
  return localStorage.getItem(LOCAL_STORAGE_TERMINAL_THEME_KEY) ?? "mocha";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function openExternalUrl(url: string) {
  if (desktop.available()) {
    void desktop.shell.openExternal(url);
  } else {
    window.open(url, "_blank");
  }
}

export function isDemo() {
  return (
    document.location.host === "demo.soulfiremc.com" ||
    localStorage.getItem(LOCAL_STORAGE_DEMO_MODE_KEY) === "true"
  );
}

export function cancellablePromiseDefault<T extends () => void>(
  promise: Promise<T>,
): () => void {
  return cancellablePromise(promise, (run) => run());
}

function cancellablePromise<T>(
  promise: Promise<T>,
  cancel: (value: T) => void,
): () => void {
  let cancelled = false;
  let resolvedValue: T | null = null;
  void promise.then((value) => {
    if (cancelled) {
      cancel(value);
    } else {
      resolvedValue = value;
    }
  });

  return () => {
    cancelled = true;
    if (resolvedValue != null) {
      cancel(resolvedValue);
    }
  };
}

export function hasGlobalPermission(
  clientData: ClientDataResponse,
  permission: GlobalPermission,
) {
  if (isDemo()) {
    return true;
  }

  return clientData.serverPermissions
    .filter((p) => p.granted)
    .map((p) => p.globalPermission)
    .includes(permission);
}

export function hasInstancePermission(
  instanceInfo: InstanceInfo | InstanceListResponse_Instance,
  permission: InstancePermission,
) {
  if (isDemo()) {
    return true;
  }

  return instanceInfo.instancePermissions
    .filter((p) => p.granted)
    .map((p) => p.instancePermission)
    .includes(permission);
}

export function getGravatarUrl(email: string) {
  return `https://www.gravatar.com/avatar/${sha256(email)}?d=404`;
}

export function data2blob(data: string) {
  const bytes = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    bytes[i] = data.charCodeAt(i);
  }

  return new Blob([new Uint8Array(bytes)]);
}

export function languageEmoji(locale: string): ReactNode {
  if (locale === "lol-US") {
    return "🐱";
  }

  if (locale === "en-UD") {
    return "🙃";
  }

  if (locale === "en-PT") {
    return "🏴‍☠️";
  }

  const countryCode = locale.split("-")[1];
  if (!countryCode) return "";

  const Flag = emojiMap[countryCode];
  if (!Flag) return "";

  return <Flag className="mx-1 size-4 align-middle" />;
}

export function getLanguageName(languageCode: string, displayLanguage: string) {
  if (languageCode === "lol-US") {
    return "LOLCAT";
  }

  if (languageCode === "en-UD") {
    return "Upside Down English";
  }

  if (languageCode === "en-PT") {
    return "Pirate English";
  }

  const displayNames = new Intl.DisplayNames([displayLanguage], {
    type: "language",
  });
  return displayNames.of(languageCode) ?? languageCode;
}

export function updateEntry<T extends BaseSettings>(
  namespace: string,
  settingKey: string,
  value: JsonValue,
  profile: T,
): T {
  return {
    ...profile,
    settings: {
      ...profile.settings,
      [namespace]: {
        ...(profile.settings[namespace] || {}),
        [settingKey]: value,
      },
    },
  };
}

function getEntryValue(
  namespace: string,
  settingKey: string,
  config: BaseSettings,
  defaultValue: JsonValue,
): JsonValue {
  const current = config.settings[namespace]?.[settingKey];
  if (current === undefined) {
    return defaultValue;
  }

  return current;
}

export function getSettingValue(
  config: BaseSettings,
  definition: SettingsDefinition | undefined,
): JsonValue {
  const namespace = definition?.id?.namespace;
  const key = definition?.id?.key;
  if (!namespace || !key) {
    return null;
  }

  switch (definition?.type.case) {
    case "string": {
      return getEntryValue(namespace, key, config, definition.type.value.def);
    }
    case "int": {
      return getEntryValue(namespace, key, config, definition.type.value.def);
    }
    case "bool": {
      return getEntryValue(namespace, key, config, definition.type.value.def);
    }
    case "double": {
      return getEntryValue(namespace, key, config, definition.type.value.def);
    }
    case "combo": {
      return getEntryValue(namespace, key, config, definition.type.value.def);
    }
    case "stringList": {
      return getEntryValue(namespace, key, config, definition.type.value.def);
    }
    case "minMax": {
      return getEntryValue(namespace, key, config, {
        min: definition.type.value.minEntry?.def ?? null,
        max: definition.type.value.maxEntry?.def ?? null,
      });
    }
    default: {
      return null;
    }
  }
}

export function getSettingIdentifierKey(id: SettingsEntryIdentifier): string {
  return `${id.namespace}:${id.key}`;
}

export async function setInstanceIcon(
  icon: string,
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
  instanceListQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: instanceInfoQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: instanceListQueryKey,
    }),
  ]);
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        icon: icon,
      };
    },
  );
  // Update optimistically
  queryClient.setQueryData<InstanceListResponse>(
    instanceListQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return create(InstanceListResponseSchema, {
        instances: old.instances.map((item) =>
          item.id === instanceInfo.id
            ? {
                ...item,
                icon,
              }
            : item,
        ),
      });
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.updateInstanceMeta({
    id: instanceInfo.id,
    meta: {
      case: "icon",
      value: icon,
    },
  });
}

export async function setInstanceFriendlyName(
  friendlyName: string,
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
  instanceListQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: instanceInfoQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: instanceListQueryKey,
    }),
  ]);
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        friendlyName: friendlyName,
      };
    },
  );
  // Update optimistically
  queryClient.setQueryData<InstanceListResponse>(
    instanceListQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return create(InstanceListResponseSchema, {
        instances: old.instances.map((item) =>
          item.id === instanceInfo.id
            ? {
                ...item,
                friendlyName,
              }
            : item,
        ),
      });
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.updateInstanceMeta({
    id: instanceInfo.id,
    meta: {
      case: "friendlyName",
      value: friendlyName,
    },
  });
}

// Used only for profile import - sends entire config
export async function setInstanceConfigFull(
  jsonProfile: ProfileRoot,
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  const targetProfile = convertToInstanceProto(jsonProfile);
  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        config: targetProfile,
        profile: jsonProfile,
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.updateInstanceConfig({
    id: instanceInfo.id,
    config: targetProfile,
  });
}

// Granular config entry update for instance settings
export async function updateInstanceConfigEntry(
  namespace: string,
  key: string,
  value: JsonValue,
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        profile: updateEntry(namespace, key, value, old.profile),
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.updateInstanceConfigEntry({
    id: instanceInfo.id,
    namespace: namespace,
    key: key,
    value: jsonToValue(value),
  });
}

// Granular config entry update for server settings
export async function updateServerConfigEntry(
  namespace: string,
  key: string,
  value: JsonValue,
  transport: Transport | null,
  queryClient: QueryClient,
  serverInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await queryClient.cancelQueries({
    queryKey: serverInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<ServerInfoQueryData>(serverInfoQueryKey, (old) => {
    if (old === undefined) {
      return;
    }

    return {
      ...old,
      profile: updateEntry(namespace, key, value, old.profile),
    };
  });

  const serverService = createClient(ServerService, transport);
  await serverService.updateServerConfigEntry({
    namespace: namespace,
    key: key,
    value: jsonToValue(value),
  });
}

// Granular config entry update for bot settings
export async function updateBotConfigEntry(
  namespace: string,
  key: string,
  value: JsonValue,
  instanceId: string,
  botId: string,
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically - config is now stored on the account in instance info
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      const accountIndex = old.profile.accounts.findIndex(
        (a) => a.profileId === botId,
      );
      if (accountIndex < 0) {
        return old;
      }

      const account = old.profile.accounts[accountIndex];
      const currentSettings = account.config ?? [];
      const namespaceIndex = currentSettings.findIndex(
        (ns) => ns.namespace === namespace,
      );
      const newSettings = [...currentSettings];
      if (namespaceIndex >= 0) {
        const entries = [...newSettings[namespaceIndex].entries];
        const entryIndex = entries.findIndex((e) => e.key === key);
        if (entryIndex >= 0) {
          entries[entryIndex] = create(SettingsNamespace_SettingsEntrySchema, {
            key,
            value: jsonToValue(value),
          });
        } else {
          entries.push(
            create(SettingsNamespace_SettingsEntrySchema, {
              key,
              value: jsonToValue(value),
            }),
          );
        }
        newSettings[namespaceIndex] = {
          ...newSettings[namespaceIndex],
          entries,
        };
      } else {
        newSettings.push(toSettingsNamespace(namespace, { [key]: value }));
      }

      const newAccounts = [...old.profile.accounts];
      newAccounts[accountIndex] = {
        ...account,
        config: newSettings,
      };

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: newAccounts,
        },
      };
    },
  );

  const botService = createClient(BotService, transport);
  await botService.updateBotConfigEntry({
    instanceId: instanceId,
    botId: botId,
    namespace: namespace,
    key: key,
    value: jsonToValue(value),
  });
}

export async function removeBotConfigEntry(
  namespace: string,
  key: string,
  instanceId: string,
  botId: string,
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  let updatedAccount: ProfileAccount | null = null;

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });

  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      const accountIndex = old.profile.accounts.findIndex(
        (account) => account.profileId === botId,
      );
      if (accountIndex < 0) {
        return old;
      }

      const account = old.profile.accounts[accountIndex];
      const nextConfig = account.config
        .map((settingsNamespace) => {
          if (settingsNamespace.namespace !== namespace) {
            return settingsNamespace;
          }

          return {
            ...settingsNamespace,
            entries: settingsNamespace.entries.filter(
              (entry) => entry.key !== key,
            ),
          };
        })
        .filter((settingsNamespace) => settingsNamespace.entries.length > 0);

      updatedAccount = {
        ...account,
        config: nextConfig,
      };

      const nextAccounts = [...old.profile.accounts];
      nextAccounts[accountIndex] = updatedAccount;

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: nextAccounts,
        },
      };
    },
  );

  if (updatedAccount === null) {
    return;
  }

  const instanceService = createClient(InstanceService, transport);
  await instanceService.updateInstanceAccount({
    id: instanceId,
    account: toMinecraftAccountProto(updatedAccount),
  });
}

// Account operations
export async function addInstanceAccount(
  account: ProfileAccount,
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  const accountProto: MinecraftAccountProto = toMinecraftAccountProto(account);

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: [...old.profile.accounts, account],
        },
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.addInstanceAccount({
    id: instanceInfo.id,
    account: accountProto,
  });
}

// Batch account operations
export async function addInstanceAccountsBatch(
  accounts: ProfileAccount[],
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  const accountProtos: MinecraftAccountProto[] = accounts.map(
    toMinecraftAccountProto,
  );

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: [...old.profile.accounts, ...accounts],
        },
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.addInstanceAccountsBatch({
    id: instanceInfo.id,
    accounts: accountProtos,
  });
}

export async function removeInstanceAccountsBatch(
  profileIds: string[],
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  const profileIdSet = new Set(profileIds);

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: old.profile.accounts.filter(
            (a) => !profileIdSet.has(a.profileId),
          ),
        },
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.removeInstanceAccountsBatch({
    id: instanceInfo.id,
    profileIds: profileIds,
  });
}

export async function applyGeneratedAccounts(
  newAccounts: ProfileAccount[],
  mode: GenerateAccountsMode,
  existingAccounts: ProfileAccount[],
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  switch (mode) {
    case "IGNORE_EXISTING":
      // Just append new accounts (duplicates already filtered during generation)
      await addInstanceAccountsBatch(
        newAccounts,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryKey,
      );
      break;
    case "REPLACE_EXISTING": {
      // Remove accounts with colliding UUIDs, then add new accounts
      const newProfileIds = new Set(newAccounts.map((a) => a.profileId));
      const existingToRemove = existingAccounts
        .filter((a) => newProfileIds.has(a.profileId))
        .map((a) => a.profileId);
      if (existingToRemove.length > 0) {
        await removeInstanceAccountsBatch(
          existingToRemove,
          instanceInfo,
          transport,
          queryClient,
          instanceInfoQueryKey,
        );
      }
      await addInstanceAccountsBatch(
        newAccounts,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryKey,
      );
      break;
    }
    case "REPLACE_ALL": {
      // Delete all existing accounts and replace with generated ones
      const allExistingIds = existingAccounts.map((a) => a.profileId);
      if (allExistingIds.length > 0) {
        await removeInstanceAccountsBatch(
          allExistingIds,
          instanceInfo,
          transport,
          queryClient,
          instanceInfoQueryKey,
        );
      }
      await addInstanceAccountsBatch(
        newAccounts,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryKey,
      );
      break;
    }
  }
}

// Batch proxy operations
export async function addInstanceProxiesBatch(
  proxies: ProfileProxy[],
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  const proxyProtos: ProxyProto[] = proxies.map(toProxyProto);

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          proxies: [...old.profile.proxies, ...proxies],
        },
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.addInstanceProxiesBatch({
    id: instanceInfo.id,
    proxies: proxyProtos,
  });
}

export async function removeInstanceProxiesBatch(
  addresses: string[],
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  const addressSet = new Set(addresses);

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          proxies: old.profile.proxies.filter(
            (p) => !addressSet.has(p.address),
          ),
        },
      };
    },
  );

  const instanceService = createClient(InstanceService, transport);
  await instanceService.removeInstanceProxiesBatch({
    id: instanceInfo.id,
    addresses: addresses,
  });
}

export async function setSelfUsername(
  username: string,
  transport: Transport | null,
  queryClient: QueryClient,
  clientDataQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await queryClient.cancelQueries({
    queryKey: clientDataQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<ClientDataResponse>(clientDataQueryKey, (old) => {
    if (old === undefined) {
      return;
    }

    return {
      ...old,
      username: username,
    };
  });

  const clientService = createClient(ClientService, transport);
  await clientService.updateSelfUsername({
    username: username,
  });
}

export async function setSelfEmail(
  email: string,
  transport: Transport | null,
  queryClient: QueryClient,
  clientDataQueryKey: QueryKey,
) {
  if (transport === null) {
    return;
  }

  await queryClient.cancelQueries({
    queryKey: clientDataQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<ClientDataResponse>(clientDataQueryKey, (old) => {
    if (old === undefined) {
      return;
    }

    return {
      ...old,
      email: email,
    };
  });

  const clientService = createClient(ClientService, transport);
  await clientService.updateSelfEmail({
    email: email,
  });
}

export function timestampToDate(timestamp: Timestamp): Date {
  return new Date(
    Number(timestamp.seconds) * 1000 + Math.floor((timestamp.nanos || 0) / 1e6),
  );
}

export function runAsync(fn: () => Promise<void>) {
  void fn().catch(console.error);
}

export function formatIconName(text: string): string {
  return text
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
export function smartEntries<T extends object>(
  obj: T,
): [keyof T, T[keyof T]][] {
  return Object.entries(obj).map(([key, value]) => [
    key as keyof T,
    value as T[keyof T],
  ]);
}

type McLogsResponse =
  | {
      success: true;
      id: string;
      url: string;
      raw: string;
    }
  | {
      success: false;
      error: string;
    };

export async function uploadToMcLogs(content: string): Promise<McLogsResponse> {
  const response = await fetch("https://api.mclo.gs/1/log", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ content }),
  });

  return await response.json();
}

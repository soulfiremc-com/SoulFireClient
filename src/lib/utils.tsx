import { createRpcClient } from "@/lib/rpc";
import { Effect, Schema } from "effect";
import { create, type JsonValue } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import type { Transport } from "@connectrpc/connect";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { type ClassValue, clsx } from "clsx";
import { sha256 } from "js-sha256";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { BotService } from "@/generated/soulfire/bot_pb";
import type { ClientDataResponse } from "@/generated/soulfire/client_pb";
import { ClientService } from "@/generated/soulfire/client_pb";
import type {
  GlobalPermission,
  InstancePermission,
  MinecraftAccountProto,
  ProxyProto,
  SettingsDefinition,
  SettingsEntryIdentifier,
} from "@/generated/soulfire/common_pb";
import { SettingsNamespace_SettingsEntrySchema } from "@/generated/soulfire/common_pb";
import type {
  InstanceInfo,
  InstanceListResponse,
  InstanceListResponse_Instance,
} from "@/generated/soulfire/instance_pb";
import {
  InstanceListResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { ServerService } from "@/generated/soulfire/server_pb";
import { mergeAccounts } from "@/lib/account-list.ts";
import { isDemoHostname } from "@/lib/app-deployment.ts";
import { desktop } from "@/lib/desktop.ts";
import { getLanguageFlag } from "@/lib/language-flags.ts";
import { jsonToValue } from "@/lib/protobuf.ts";
import { removeProxyEntries } from "@/lib/proxy-selection.ts";
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
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function isDemo() {
  return (
    isDemoHostname(document.location.hostname) ||
    localStorage.getItem(LOCAL_STORAGE_DEMO_MODE_KEY) === "true"
  );
}

export function cancellablePromiseDefault<T extends () => void>(
  promise: Promise<T>,
): () => void {
  return cancellablePromise(promise, (run) => {
    run();
  });
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

  const Flag = getLanguageFlag(locale);
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
        ...profile.settings[namespace],
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

  switch (definition.type.case) {
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
    case undefined:
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
        return undefined;
      }

      return {
        ...old,
        icon,
      };
    },
  );
  // Update optimistically
  queryClient.setQueryData<InstanceListResponse>(
    instanceListQueryKey,
    (old) => {
      if (old === undefined) {
        return undefined;
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

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.updateInstanceMeta({
      id: instanceInfo.id,
      meta: {
        case: "icon",
        value: icon,
      },
    }),
  );
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
        return undefined;
      }

      return {
        ...old,
        friendlyName,
      };
    },
  );
  // Update optimistically
  queryClient.setQueryData<InstanceListResponse>(
    instanceListQueryKey,
    (old) => {
      if (old === undefined) {
        return undefined;
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

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.updateInstanceMeta({
      id: instanceInfo.id,
      meta: {
        case: "friendlyName",
        value: friendlyName,
      },
    }),
  );
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
        return undefined;
      }

      return {
        ...old,
        config: targetProfile,
        profile: jsonProfile,
      };
    },
  );

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.updateInstanceConfig({
      id: instanceInfo.id,
      config: targetProfile,
    }),
  );
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
        return undefined;
      }

      return {
        ...old,
        profile: updateEntry(namespace, key, value, old.profile),
      };
    },
  );

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.updateInstanceConfigEntry({
      id: instanceInfo.id,
      namespace,
      key,
      value: jsonToValue(value),
    }),
  );
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
      return undefined;
    }

    return {
      ...old,
      profile: updateEntry(namespace, key, value, old.profile),
    };
  });

  const serverService = createRpcClient(ServerService, transport);
  await Effect.runPromise(
    serverService.updateServerConfigEntry({
      namespace,
      key,
      value: jsonToValue(value),
    }),
  );
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
        return undefined;
      }

      const accountIndex = old.profile.accounts.findIndex(
        (a) => a.profileId === botId,
      );
      const account = old.profile.accounts[accountIndex];
      if (account === undefined) {
        return old;
      }
      const currentSettings = account.config;
      const namespaceIndex = currentSettings.findIndex(
        (ns) => ns.namespace === namespace,
      );
      const newSettings = [...currentSettings];
      const currentNamespace = newSettings[namespaceIndex];
      if (currentNamespace) {
        const entries = [...currentNamespace.entries];
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
          ...currentNamespace,
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

  const botService = createRpcClient(BotService, transport);
  await Effect.runPromise(
    botService.updateBotConfigEntry({
      instanceId,
      botId,
      namespace,
      key,
      value: jsonToValue(value),
    }),
  );
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

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });

  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return undefined;
      }

      const accountIndex = old.profile.accounts.findIndex(
        (account) => account.profileId === botId,
      );
      const account = old.profile.accounts[accountIndex];
      if (account === undefined) {
        return old;
      }
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

      const updatedAccount = {
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

  const botService = createRpcClient(BotService, transport);
  await Effect.runPromise(
    botService.deleteBotConfigEntry({
      instanceId,
      botId,
      namespace,
      key,
    }),
  );
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
        return undefined;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: mergeAccounts(old.profile.accounts, [account]),
        },
      };
    },
  );

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.addInstanceAccount({
      id: instanceInfo.id,
      account: accountProto,
    }),
  );
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

  const accountProtos: MinecraftAccountProto[] = accounts.map((account) =>
    toMinecraftAccountProto(account),
  );

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return undefined;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          accounts: mergeAccounts(old.profile.accounts, accounts),
        },
      };
    },
  );

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.addInstanceAccountsBatch({
      id: instanceInfo.id,
      accounts: accountProtos,
    }),
  );
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
        return undefined;
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

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.removeInstanceAccountsBatch({
      id: instanceInfo.id,
      profileIds,
    }),
  );
}

export async function applyGeneratedAccounts(
  newAccounts: ProfileAccount[],
  mode: GenerateAccountsMode,
  instanceInfo: {
    id: string;
  },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  if (mode !== "REPLACE_ALL") {
    await addInstanceAccountsBatch(
      newAccounts,
      instanceInfo,
      transport,
      queryClient,
      instanceInfoQueryKey,
    );
    return;
  }
  if (transport === null) return;

  await queryClient.cancelQueries({ queryKey: instanceInfoQueryKey });
  queryClient.setQueryData<InstanceInfoQueryData>(instanceInfoQueryKey, (old) =>
    old
      ? {
          ...old,
          profile: {
            ...old.profile,
            accounts: mergeAccounts([], newAccounts),
          },
        }
      : old,
  );
  await Effect.runPromise(
    createRpcClient(InstanceService, transport).replaceInstanceAccounts({
      id: instanceInfo.id,
      accounts: newAccounts.map((account) => toMinecraftAccountProto(account)),
    }),
  );
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

  const proxyProtos: ProxyProto[] = proxies.map((proxy) => toProxyProto(proxy));

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return undefined;
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

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.addInstanceProxiesBatch({
      id: instanceInfo.id,
      proxies: proxyProtos,
    }),
  );
}

export async function removeInstanceProxyEntries(
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

  await queryClient.cancelQueries({
    queryKey: instanceInfoQueryKey,
  });
  // Update optimistically
  queryClient.setQueryData<InstanceInfoQueryData>(
    instanceInfoQueryKey,
    (old) => {
      if (old === undefined) {
        return undefined;
      }

      return {
        ...old,
        profile: {
          ...old.profile,
          proxies: removeProxyEntries(old.profile.proxies, proxies),
        },
      };
    },
  );

  const instanceService = createRpcClient(InstanceService, transport);
  await Effect.runPromise(
    instanceService.removeInstanceProxyEntries({
      id: instanceInfo.id,
      proxies: proxies.map((proxy) => toProxyProto(proxy)),
    }),
  );
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
      return undefined;
    }

    return {
      ...old,
      username,
    };
  });

  const clientService = createRpcClient(ClientService, transport);
  await Effect.runPromise(
    clientService.updateSelfUsername({
      username,
    }),
  );
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
      return undefined;
    }

    return {
      ...old,
      email,
    };
  });

  const clientService = createRpcClient(ClientService, transport);
  await Effect.runPromise(
    clientService.updateSelfEmail({
      email,
    }),
  );
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries loses the key and value types of the typed record
    key as keyof T,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries loses the key and value types of the typed record
    value as T[keyof T],
  ]);
}

// Decode only the fields the upload action reads.
const McLogsResponseSchema = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    url: Schema.String,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    error: Schema.String,
  }),
]);
type McLogsResponse = typeof McLogsResponseSchema.Type;

export async function uploadToMcLogs(content: string): Promise<McLogsResponse> {
  const response = await fetch("https://api.mclo.gs/1/log", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ content }),
  });

  return Schema.decodeUnknownPromise(McLogsResponseSchema)(
    await response.json(),
  );
}

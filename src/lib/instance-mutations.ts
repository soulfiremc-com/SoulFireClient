import { create, type JsonValue } from "@bufbuild/protobuf";
import type { ConnectError, Transport } from "@connectrpc/connect";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { Effect } from "effect";
import { TaggedError as TaggedFailure } from "effect/Schema";
import { BotService } from "@/generated/soulfire/bot_pb";
import {
  type ClientDataResponse,
  ClientService,
} from "@/generated/soulfire/client_pb";
import { SettingsNamespace_SettingsEntrySchema } from "@/generated/soulfire/common_pb";
import {
  type InstanceListResponse,
  InstanceListResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { ServerService } from "@/generated/soulfire/server_pb";
import { mergeAccounts } from "@/lib/account-list.ts";
import { jsonToValue } from "@/lib/protobuf.ts";
import { removeProxyEntries } from "@/lib/proxy-selection.ts";
import { createRpcClient } from "@/lib/rpc.ts";
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

/**
 * The demo has no server, so a write cannot be saved. Mutators throw this
 * instead of returning, so callers do not report a save that did not happen.
 */
export class DemoReadOnlyError extends TaggedFailure<
  DemoReadOnlyError,
  { readonly brand: unique symbol }
>()("DemoReadOnlyError", {}) {
  override get message() {
    return "The demo does not save changes";
  }
}

export function isDemoReadOnlyError(
  error: unknown,
): error is DemoReadOnlyError {
  return error instanceof DemoReadOnlyError;
}

/** One optimistic change to a cached query. */
export interface CacheEdit {
  queryKey: QueryKey;
  apply: (queryClient: QueryClient) => void;
}

/** Changes cached data for `queryKey`. An empty cache stays empty. */
export function cacheEdit<T>(
  queryKey: QueryKey,
  update: (old: T) => T,
): CacheEdit {
  return {
    queryKey,
    apply: (queryClient) => {
      queryClient.setQueryData<T>(queryKey, (old) =>
        old === undefined ? undefined : update(old),
      );
    },
  };
}

/**
 * Shows a write in the cache at once, then sends it to the server.
 *
 * It cancels running fetches first, so a poll that started before the write
 * cannot replace the edit with older data. If the server rejects the write,
 * it marks the edited queries as invalid, so the next fetch loads full server
 * state. Callers still invalidate on settle to refetch at once.
 */
export async function optimisticWrite(
  transport: Transport | null,
  queryClient: QueryClient,
  edits: readonly CacheEdit[],
  write: (transport: Transport) => Effect.Effect<unknown, ConnectError>,
): Promise<void> {
  if (transport === null) {
    throw DemoReadOnlyError.make({});
  }

  await Promise.all(
    edits.map(({ queryKey }) => queryClient.cancelQueries({ queryKey })),
  );
  for (const edit of edits) {
    edit.apply(queryClient);
  }

  try {
    await Effect.runPromise(write(transport));
  } catch (error) {
    await Promise.all(
      edits.map(({ queryKey }) =>
        queryClient.invalidateQueries({ queryKey, refetchType: "none" }),
      ),
    );
    throw error;
  }
}

function updateEntry<T extends BaseSettings>(
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

function editProfile(
  queryKey: QueryKey,
  update: (profile: ProfileRoot) => ProfileRoot,
) {
  return cacheEdit<InstanceInfoQueryData>(queryKey, (old) => ({
    ...old,
    profile: update(old.profile),
  }));
}

function editListedInstance(
  queryKey: QueryKey,
  instanceId: string,
  meta: { icon: string } | { friendlyName: string },
) {
  return cacheEdit<InstanceListResponse>(queryKey, (old) =>
    create(InstanceListResponseSchema, {
      instances: old.instances.map((item) =>
        item.id === instanceId ? { ...item, ...meta } : item,
      ),
    }),
  );
}

function editBotConfig(
  queryKey: QueryKey,
  botId: string,
  update: (config: ProfileAccount["config"]) => ProfileAccount["config"],
) {
  return editProfile(queryKey, (profile) => ({
    ...profile,
    accounts: profile.accounts.map((account) =>
      account.profileId === botId
        ? { ...account, config: update(account.config) }
        : account,
    ),
  }));
}

export async function setInstanceIcon(
  icon: string,
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
  instanceListQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      cacheEdit<InstanceInfoQueryData>(instanceInfoQueryKey, (old) => ({
        ...old,
        icon,
      })),
      editListedInstance(instanceListQueryKey, instanceInfo.id, { icon }),
    ],
    (t) =>
      createRpcClient(InstanceService, t).updateInstanceMeta({
        id: instanceInfo.id,
        meta: { case: "icon", value: icon },
      }),
  );
}

export async function setInstanceFriendlyName(
  friendlyName: string,
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
  instanceListQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      cacheEdit<InstanceInfoQueryData>(instanceInfoQueryKey, (old) => ({
        ...old,
        friendlyName,
      })),
      editListedInstance(instanceListQueryKey, instanceInfo.id, {
        friendlyName,
      }),
    ],
    (t) =>
      createRpcClient(InstanceService, t).updateInstanceMeta({
        id: instanceInfo.id,
        meta: { case: "friendlyName", value: friendlyName },
      }),
  );
}

/** Replaces the whole instance config. Used only for profile import. */
export async function setInstanceConfigFull(
  jsonProfile: ProfileRoot,
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  const config = convertToInstanceProto(jsonProfile);
  await optimisticWrite(
    transport,
    queryClient,
    [
      cacheEdit<InstanceInfoQueryData>(instanceInfoQueryKey, (old) => ({
        ...old,
        config,
        profile: jsonProfile,
      })),
    ],
    (t) =>
      createRpcClient(InstanceService, t).updateInstanceConfig({
        id: instanceInfo.id,
        config,
      }),
  );
}

export async function updateInstanceConfigEntry(
  namespace: string,
  key: string,
  value: JsonValue,
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      editProfile(instanceInfoQueryKey, (profile) =>
        updateEntry(namespace, key, value, profile),
      ),
    ],
    (t) =>
      createRpcClient(InstanceService, t).updateInstanceConfigEntry({
        id: instanceInfo.id,
        namespace,
        key,
        value: jsonToValue(value),
      }),
  );
}

export async function updateServerConfigEntry(
  namespace: string,
  key: string,
  value: JsonValue,
  transport: Transport | null,
  queryClient: QueryClient,
  serverInfoQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      cacheEdit<ServerInfoQueryData>(serverInfoQueryKey, (old) => ({
        ...old,
        profile: updateEntry(namespace, key, value, old.profile),
      })),
    ],
    (t) =>
      createRpcClient(ServerService, t).updateServerConfigEntry({
        namespace,
        key,
        value: jsonToValue(value),
      }),
  );
}

/** Bot settings live on the bot's account in the instance info. */
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
  const entry = create(SettingsNamespace_SettingsEntrySchema, {
    key,
    value: jsonToValue(value),
  });
  await optimisticWrite(
    transport,
    queryClient,
    [
      editBotConfig(instanceInfoQueryKey, botId, (config) =>
        config.some((ns) => ns.namespace === namespace)
          ? config.map((ns) =>
              ns.namespace === namespace
                ? {
                    ...ns,
                    entries: ns.entries.some((e) => e.key === key)
                      ? ns.entries.map((e) => (e.key === key ? entry : e))
                      : [...ns.entries, entry],
                  }
                : ns,
            )
          : [...config, toSettingsNamespace(namespace, { [key]: value })],
      ),
    ],
    (t) =>
      createRpcClient(BotService, t).updateBotConfigEntry({
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
  await optimisticWrite(
    transport,
    queryClient,
    [
      editBotConfig(instanceInfoQueryKey, botId, (config) =>
        config
          .map((ns) =>
            ns.namespace === namespace
              ? { ...ns, entries: ns.entries.filter((e) => e.key !== key) }
              : ns,
          )
          .filter((ns) => ns.entries.length > 0),
      ),
    ],
    (t) =>
      createRpcClient(BotService, t).deleteBotConfigEntry({
        instanceId,
        botId,
        namespace,
        key,
      }),
  );
}

export async function addInstanceAccountsBatch(
  accounts: ProfileAccount[],
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      editProfile(instanceInfoQueryKey, (profile) => ({
        ...profile,
        accounts: mergeAccounts(profile.accounts, accounts),
      })),
    ],
    (t) =>
      createRpcClient(InstanceService, t).addInstanceAccountsBatch({
        id: instanceInfo.id,
        accounts: accounts.map((item) => toMinecraftAccountProto(item)),
      }),
  );
}

export async function removeInstanceAccountsBatch(
  profileIds: string[],
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  const removed = new Set(profileIds);
  await optimisticWrite(
    transport,
    queryClient,
    [
      editProfile(instanceInfoQueryKey, (profile) => ({
        ...profile,
        accounts: profile.accounts.filter((a) => !removed.has(a.profileId)),
      })),
    ],
    (t) =>
      createRpcClient(InstanceService, t).removeInstanceAccountsBatch({
        id: instanceInfo.id,
        profileIds,
      }),
  );
}

export async function applyGeneratedAccounts(
  newAccounts: ProfileAccount[],
  mode: GenerateAccountsMode,
  instanceInfo: { id: string },
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

  await optimisticWrite(
    transport,
    queryClient,
    [
      editProfile(instanceInfoQueryKey, (profile) => ({
        ...profile,
        accounts: mergeAccounts([], newAccounts),
      })),
    ],
    (t) =>
      createRpcClient(InstanceService, t).replaceInstanceAccounts({
        id: instanceInfo.id,
        accounts: newAccounts.map((item) => toMinecraftAccountProto(item)),
      }),
  );
}

export async function addInstanceProxiesBatch(
  proxies: ProfileProxy[],
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      editProfile(instanceInfoQueryKey, (profile) => ({
        ...profile,
        proxies: [...profile.proxies, ...proxies],
      })),
    ],
    (t) =>
      createRpcClient(InstanceService, t).addInstanceProxiesBatch({
        id: instanceInfo.id,
        proxies: proxies.map((item) => toProxyProto(item)),
      }),
  );
}

export async function removeInstanceProxyEntries(
  proxies: ProfileProxy[],
  instanceInfo: { id: string },
  transport: Transport | null,
  queryClient: QueryClient,
  instanceInfoQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      editProfile(instanceInfoQueryKey, (profile) => ({
        ...profile,
        proxies: removeProxyEntries(profile.proxies, proxies),
      })),
    ],
    (t) =>
      createRpcClient(InstanceService, t).removeInstanceProxyEntries({
        id: instanceInfo.id,
        proxies: proxies.map((item) => toProxyProto(item)),
      }),
  );
}

export async function setSelfUsername(
  username: string,
  transport: Transport | null,
  queryClient: QueryClient,
  clientDataQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      cacheEdit<ClientDataResponse>(clientDataQueryKey, (old) => ({
        ...old,
        username,
      })),
    ],
    (t) => createRpcClient(ClientService, t).updateSelfUsername({ username }),
  );
}

export async function setSelfEmail(
  email: string,
  transport: Transport | null,
  queryClient: QueryClient,
  clientDataQueryKey: QueryKey,
) {
  await optimisticWrite(
    transport,
    queryClient,
    [
      cacheEdit<ClientDataResponse>(clientDataQueryKey, (old) => ({
        ...old,
        email,
      })),
    ],
    (t) => createRpcClient(ClientService, t).updateSelfEmail({ email }),
  );
}

import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import type { Transport } from "@connectrpc/connect";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import {
  demoInstancePermissions,
  demoInstancePlugins,
  demoInstanceSettings,
  demoInstanceSettingsDefinitions,
} from "@/demo-data.ts";
import { BotFleetSummarySchema } from "@/generated/soulfire/bot_pb";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProto_OfflineJavaDataSchema,
  ProxyProto_Type,
  ProxyProtoSchema,
} from "@/generated/soulfire/common_pb";
import {
  InstanceConfigSchema,
  InstanceInfoSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { queryKeys } from "@/lib/query-keys.ts";
import { createRpcClient } from "@/lib/rpc.ts";
import {
  convertFromInstanceProto,
  type InstanceInfoQueryData,
} from "@/lib/types.ts";

/**
 * Instance info, polled every 3 seconds. Without a transport it returns the
 * demo project.
 */
export function instanceInfoQueryOptions(
  transport: Transport | null,
  instanceId: string,
) {
  // oxlint-disable-next-line tanstack-query/exhaustive-deps -- The query cache is scoped to the authentication session and cleared when its transport credentials change.
  return queryOptions({
    queryKey: queryKeys.instanceInfo(instanceId),
    queryFn: ({ client, signal }) =>
      transport === null
        ? demoInstanceInfo(instanceId)
        : fetchInstanceInfo(transport, instanceId, client, signal),
    refetchInterval: 3000,
  });
}

function demoInstanceInfo(instanceId: string): InstanceInfoQueryData {
  const config = create(InstanceConfigSchema, {
    accounts: [
      {
        type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
        profileId: "607d30e7-115b-3838-914a-e4229c2b985d",
        lastKnownName: "Pistonmaster",
        accountData: {
          case: "offlineJavaData",
          value: create(MinecraftAccountProto_OfflineJavaDataSchema, {}),
        },
      },
    ],
    proxies: [
      create(ProxyProtoSchema, {
        type: ProxyProto_Type.HTTP,
        address: "127.0.0.1:8080",
        username: "admin",
        password: "admin",
      }),
      create(ProxyProtoSchema, {
        type: ProxyProto_Type.SOCKS4,
        address: "127.0.0.1:8081",
        username: "admin",
      }),
      create(ProxyProtoSchema, {
        type: ProxyProto_Type.SOCKS5,
        address: "127.0.0.1:8082",
        username: "admin",
        password: "admin",
      }),
    ],
  });
  const info = create(InstanceInfoSchema, {
    friendlyName: "Demo",
    icon: "pickaxe",
    instancePermissions: demoInstancePermissions,
    config,
    settingsDefinitions: demoInstanceSettingsDefinitions,
    instanceSettings: demoInstanceSettings,
    plugins: demoInstancePlugins,
    botSummary: create(BotFleetSummarySchema, {
      totalBots: 1,
      desiredBots: 1,
      onlineBots: 1,
    }),
    lastModified: create(TimestampSchema, { seconds: 0n, nanos: 0 }),
  });
  return {
    id: instanceId,
    profile: convertFromInstanceProto(config),
    ...info,
  };
}

export async function fetchInstanceInfo(
  transport: Transport,
  instance: string,
  client: QueryClient,
  signal?: AbortSignal,
): Promise<InstanceInfoQueryData> {
  const queryKey = queryKeys.instanceInfo(instance);
  const previousData = client.getQueryData<InstanceInfoQueryData>(queryKey);
  // Invalidated data can contain optimistic edits that the server rejected.
  const lastModified = client.getQueryState(queryKey)?.isInvalidated
    ? undefined
    : previousData?.lastModified;
  const result = await Effect.runPromise(
    createRpcClient(InstanceService, transport).getInstanceInfo(
      { id: instance, ifModifiedSince: lastModified },
      signal ? { signal } : {},
    ),
  );

  if (result.result.case === "notModified") {
    if (!previousData) throw new Error("No cached data available");
    const unchanged = result.result.value;
    if (!unchanged.botSummary && unchanged.instancePermissions.length === 0) {
      return previousData;
    }
    return {
      ...previousData,
      lastModified: unchanged.lastModified ?? previousData.lastModified,
      instancePermissions:
        unchanged.instancePermissions.length > 0
          ? unchanged.instancePermissions
          : previousData.instancePermissions,
      botSummary: unchanged.botSummary ?? previousData.botSummary,
    };
  }
  if (result.result.case !== "info") {
    throw new Error("Unexpected response type");
  }
  const info = result.result.value;
  return {
    id: instance,
    profile: convertFromInstanceProto(info.config),
    ...info,
  };
}

import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { queryOptions } from "@tanstack/react-query";
import {
  demoServerSettings,
  demoServerSettingsDefinitions,
} from "@/demo-data.ts";
import {
  type ServerConfig,
  ServerConfigSchema,
  ServerInfoResponseSchema,
  ServerService,
} from "@/generated/soulfire/server_pb";
import {
  convertFromServerProto,
  type ServerInfoQueryData,
} from "@/lib/types.ts";

/**
 * Server settings, definitions, and plugins. The server requires the
 * READ_SERVER_CONFIG permission, so check it before enabling this query.
 */
export function serverInfoQueryOptions(transport: Transport | null) {
  return queryOptions({
    queryKey: ["server-info"],
    queryFn: async ({ signal }): Promise<ServerInfoQueryData> => {
      if (transport === null) {
        const serverConfig: ServerConfig = create(ServerConfigSchema, {
          settings: [],
        });
        return {
          ...create(ServerInfoResponseSchema, {
            config: serverConfig,
            settingsDefinitions: demoServerSettingsDefinitions,
            serverSettings: demoServerSettings,
            plugins: [],
          }),
          config: serverConfig,
          profile: convertFromServerProto(serverConfig),
        };
      }
      const result = await Effect.runPromise(
        createRpcClient(ServerService, transport).getServerInfo({}, { signal }),
      );
      return {
        ...result,
        profile: convertFromServerProto(result.config as ServerConfig),
      };
    },
    refetchInterval: 3_000,
  });
}

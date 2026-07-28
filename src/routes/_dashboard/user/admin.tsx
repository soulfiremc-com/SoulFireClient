import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { UserRole } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  type ServerConfig,
  ServerConfigSchema,
  ServerInfoResponseSchema,
  ServerService,
} from "@soulfiremc/sdk/generated/soulfire/server_pb";
import {
  type UserListResponse,
  UserListResponse_UserSchema,
  UserListResponseSchema,
  UserService,
} from "@soulfiremc/sdk/generated/soulfire/user_pb";
import { queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  demoServerSettings,
  demoServerSettingsDefinitions,
} from "@/demo-data.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { serverMetricsQueryOptions } from "@/lib/server-metrics-query.ts";
import {
  convertFromServerProto,
  type ServerInfoQueryData,
} from "@/lib/types.ts";
import { createTransport } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/user/admin")({
  beforeLoad: (props) => {
    const serverInfoQueryOptions = queryOptions({
      queryKey: ["server-info"],
      queryFn: async (props): Promise<ServerInfoQueryData> => {
        const transport = createTransport();
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

        const serverService = createClient(ServerService, transport);
        const result = await serverService.getServerInfo(
          {},
          {
            signal: props.signal,
          },
        );

        // console.log(JSON.stringify(result.serverSettings))
        return {
          ...result,
          profile: convertFromServerProto(result.config as ServerConfig),
        };
      },
      refetchInterval: 3_000,
    });
    const usersQueryOptions = queryOptions({
      queryKey: ["users"],
      queryFn: async (props): Promise<UserListResponse> => {
        const transport = createTransport();
        if (transport === null) {
          return create(UserListResponseSchema, {
            users: [
              create(UserListResponse_UserSchema, {
                id: "root",
                username: "root",
                email: "root@soulfiremc.com",
                role: UserRole.ADMIN,
              }),
            ],
          });
        }

        const userService = createClient(UserService, transport);
        const result = await userService.listUsers(
          {},
          {
            signal: props.signal,
          },
        );

        return result;
      },
      refetchInterval: 3_000,
    });
    const serverMetricsOptions = serverMetricsQueryOptions(
      createTransport(),
      props.context.queryClient,
    );
    props.abortController.signal.addEventListener("abort", () => {
      void props.context.queryClient.cancelQueries({
        queryKey: serverInfoQueryOptions.queryKey,
      });
    });
    props.abortController.signal.addEventListener("abort", () => {
      void props.context.queryClient.cancelQueries({
        queryKey: usersQueryOptions.queryKey,
      });
    });
    props.abortController.signal.addEventListener("abort", () => {
      void props.context.queryClient.cancelQueries({
        queryKey: serverMetricsOptions.queryKey,
      });
    });
    return {
      serverInfoQueryOptions,
      usersQueryOptions,
      serverMetricsOptions,
      ...staticRouteChrome(() => i18n.t("common:breadcrumbs.admin"), {
        kind: "dynamic",
        name: "chart-area",
      }),
    };
  },
  loader: (props) => {
    void props.context.queryClient.prefetchQuery(
      props.context.serverInfoQueryOptions,
    );
    void props.context.queryClient.prefetchQuery(
      props.context.usersQueryOptions,
    );
    void props.context.queryClient.prefetchQuery(
      props.context.serverMetricsOptions,
    );
  },
});

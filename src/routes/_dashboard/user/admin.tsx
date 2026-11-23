import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import { queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UserRole } from "@/generated/soulfire/common_pb";
import {
  type UserListResponse,
  UserListResponse_UserSchema,
  UserListResponseSchema,
  UserService,
} from "@/generated/soulfire/user_pb";
import i18n from "@/lib/i18n";
import { queryKeys } from "@/lib/query-keys.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { serverMetricsQueryOptions } from "@/lib/server-metrics-query.ts";
import { serverInfoQueryOptions } from "@/lib/server-info-query.ts";
import { createTransport } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/user/admin")({
  beforeLoad: (props) => {
    const serverInfoOptions = serverInfoQueryOptions(createTransport());
    const usersQueryOptions = queryOptions({
      queryKey: queryKeys.users(),
      queryFn: async (context): Promise<UserListResponse> => {
        const transport = createTransport();
        if (transport === null) {
          return create(UserListResponseSchema, {
            users: [
              create(UserListResponse_UserSchema, {
                id: "root",
                username: "root",
                email: "root@soulfiremc.com",
                role: UserRole.ADMIN,
                createdAt: timestampFromDate(new Date("2025-01-01T00:00:00Z")),
                minIssuedAt: timestampFromDate(
                  new Date("2025-01-01T00:00:00Z"),
                ),
              }),
            ],
          });
        }

        const userService = createRpcClient(UserService, transport);
        return Effect.runPromise(
          userService.listUsers({}, { signal: context.signal }),
        );
      },
      // Users change rarely, and this page's own edits refetch the list.
      refetchInterval: 30_000,
    });
    const serverMetricsOptions = serverMetricsQueryOptions(createTransport());
    props.abortController.signal.addEventListener("abort", () => {
      for (const { queryKey } of [
        serverInfoOptions,
        usersQueryOptions,
        serverMetricsOptions,
      ]) {
        void props.context.queryClient.cancelQueries({ queryKey });
      }
    });
    return {
      serverInfoQueryOptions: serverInfoOptions,
      usersQueryOptions,
      serverMetricsOptions,
      ...staticRouteChrome(() => i18n.t("common:breadcrumbs.admin"), {
        kind: "dynamic",
        name: "chart-area",
      }),
    };
  },
  // Each child route prefetches only the queries it reads.
});

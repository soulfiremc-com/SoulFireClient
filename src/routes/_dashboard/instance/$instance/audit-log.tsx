import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";

import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BotIcon,
  ClipboardCopyIcon,
  LockIcon,
  PlugIcon,
  RefreshCwIcon,
  SquareTerminalIcon,
  TextIcon,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header.tsx";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton.tsx";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list.tsx";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { SFTimeAgo } from "@/components/sf-timeago.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import {
  type InstanceAuditLogResponse,
  type InstanceAuditLogResponse_AuditLogEntry,
  InstanceAuditLogResponse_AuditLogEntryType,
  InstanceAuditLogResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDataTable } from "@/hooks/use-data-table.ts";
import { calendarDateRangeFilter } from "@/lib/calendar-date-range-filter";
import type { dataTableFeatures } from "@/lib/data-table-features";
import i18n from "@/lib/i18n";
import { dataTableValidateSearch } from "@/lib/parsers.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import {
  getEnumEntries,
  getEnumKeyByValue,
  mapUnionToValue,
} from "@/lib/types.ts";
import { hasInstancePermission, timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";
import { requireField } from "@/lib/require-field";

export const Route = createFileRoute(
  "/_dashboard/instance/$instance/audit-log",
)({
  validateSearch: dataTableValidateSearch,
  beforeLoad: (props) => {
    const { instance } = props.params;
    const auditLogQueryOptions = queryOptions({
      queryKey: queryKeys.instanceAuditLog(instance),
      queryFn: async (context): Promise<InstanceAuditLogResponse> => {
        const transport = createTransport();
        if (transport === null) {
          return create(InstanceAuditLogResponseSchema, {
            entry: [],
          });
        }

        const instanceService = createRpcClient(InstanceService, transport);
        const result = await Effect.runPromise(
          instanceService.getAuditLog(
            {
              id: instance,
            },
            {
              signal: context.signal,
            },
          ),
        );

        return result;
      },
      // The server returns the whole audit log on every request, so poll
      // rarely. Focus and the refresh button pick up new entries sooner.
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    });
    props.abortController.signal.addEventListener("abort", () => {
      void props.context.queryClient.cancelQueries({
        queryKey: auditLogQueryOptions.queryKey,
      });
    });
    return {
      auditLogQueryOptions,
      ...staticRouteChrome(() => i18n.t("common:pageName.audit-log"), {
        kind: "dynamic",
        name: "text-search",
      }),
    };
  },
  loader: (props) => {
    const { queryClient, instanceInfoQueryOptions, auditLogQueryOptions } =
      props.context;
    // Reading the audit log needs its own permission. Without it the request
    // always fails.
    void queryClient
      .ensureQueryData(instanceInfoQueryOptions)
      .then((instanceInfo) =>
        hasInstancePermission(
          instanceInfo,
          InstancePermission.READ_INSTANCE_AUDIT_LOGS,
        )
          ? queryClient.prefetchQuery(auditLogQueryOptions)
          : undefined,
      )
      .catch(() => {
        // The page reads the project itself and shows its error state.
      });
  },
  component: AuditLog,
});

function toI18nKey(type: InstanceAuditLogResponse_AuditLogEntryType) {
  switch (type) {
    case InstanceAuditLogResponse_AuditLogEntryType.EXECUTE_COMMAND: {
      return "auditLog.executedCommand";
    }
    case InstanceAuditLogResponse_AuditLogEntryType.BOT_DESIRED_STATE_CHANGE: {
      return "auditLog.changedBotDesiredState";
    }
    case InstanceAuditLogResponse_AuditLogEntryType.BOT_RESTART: {
      return "auditLog.restartedBots";
    }
    case InstanceAuditLogResponse_AuditLogEntryType.PLUGIN_RPC: {
      return "auditLog.calledPluginRpc";
    }
    default: {
      return type satisfies never;
    }
  }
}

const logTypeToIcon = (
  type: keyof typeof InstanceAuditLogResponse_AuditLogEntryType,
) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "BOT_DESIRED_STATE_CHANGE": {
        return BotIcon;
      }
      case "BOT_RESTART": {
        return RefreshCwIcon;
      }
      case "EXECUTE_COMMAND": {
        return SquareTerminalIcon;
      }
      case "PLUGIN_RPC": {
        return PlugIcon;
      }
      default: {
        return BotIcon;
      }
    }
  });

const columns: ColumnDef<
  typeof dataTableFeatures,
  InstanceAuditLogResponse_AuditLogEntry
>[] = [
  {
    id: "user",
    accessorFn: (row) => `${row.user?.username} ${row.user?.email}`,
    accessorKey: "user",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("common:auditLog.user")}
      />
    ),
    cell: ({ row }) => (
      <div className="flex flex-row items-center justify-start gap-2">
        <UserAvatar
          username={row.original.user?.username || i18n.t("common:unknown")}
          email={row.original.user?.email || ""}
          className="size-8"
        />
        {row.original.user?.username}
      </div>
    ),
    meta: {
      get label() {
        return i18n.t("common:auditLog.user");
      },
      get placeholder() {
        return i18n.t("common:auditLog.searchUsers");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "type",
    accessorFn: (row) =>
      getEnumKeyByValue(InstanceAuditLogResponse_AuditLogEntryType, row.type),
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("common:auditLog.type")}
      />
    ),
    cell: ({ row }) => {
      const Icon = logTypeToIcon(
        getEnumKeyByValue(
          InstanceAuditLogResponse_AuditLogEntryType,
          row.original.type,
        ),
      );

      return (
        <Badge variant="outline">
          <Icon />
          <Trans
            i18nKey={toI18nKey(row.original.type)}
            values={{
              data: row.original.data,
            }}
          />
        </Badge>
      );
    },
    meta: {
      get label() {
        return i18n.t("common:auditLog.type");
      },
      variant: "multiSelect",
      options: getEnumEntries(InstanceAuditLogResponse_AuditLogEntryType).map(
        (type) => ({
          get label() {
            return i18n.t(`common:auditLog.types.${type.key}`);
          },
          value: type.key,
          icon: logTypeToIcon(type.key),
        }),
      ),
    },
    filterFn: "arrHas",
    enableColumnFilter: true,
  },
  {
    id: "timestamp",
    accessorFn: (row) =>
      timestampToDate(requireField(row.timestamp, "an audit log timestamp")),
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("common:auditLog.timestamp")}
      />
    ),
    cell: ({ row }) => (
      <SFTimeAgo
        date={timestampToDate(
          requireField(row.original.timestamp, "an audit log timestamp"),
        )}
      />
    ),
    enableGlobalFilter: false,
    sortFn: "datetime",
    meta: {
      get label() {
        return i18n.t("common:auditLog.timestamp");
      },
      get placeholder() {
        return i18n.t("common:auditLog.searchTimestamps");
      },
      variant: "dateRange",
    },
    filterFn: calendarDateRangeFilter,
    enableColumnFilter: true,
  },
];

function AuditLogSkeleton() {
  return (
    <div className="container flex size-full grow flex-col gap-4">
      <DataTableSkeleton
        columnCount={3}
        filterCount={3}
        cellWidths={["auto", "auto", "8rem"]}
      />
    </div>
  );
}

function AuditLog() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.audit-log")}
      loadingSkeleton={<AuditLogSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  if (
    !hasInstancePermission(
      instanceInfo,
      InstancePermission.READ_INSTANCE_AUDIT_LOGS,
    )
  ) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t("auditLog.noPermission.title")}</EmptyTitle>
          <EmptyDescription>
            {t("auditLog.noPermission.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <AuditLogTable />;
}

function AuditLogTable() {
  const { t } = useTranslation("common");
  const { auditLogQueryOptions } = Route.useRouteContext();
  const {
    data: auditLog,
    refetch,
    isFetching,
  } = useSuspenseQuery(auditLogQueryOptions);
  const { table } = useDataTable({
    data: auditLog.entry,
    columns,
    getRowId: (row) => row.id,
  });
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<InstanceAuditLogResponse_AuditLogEntry>();
  const copyToClipboard = useCopyToClipboard();

  return (
    <div className="container flex size-full grow flex-col gap-4">
      <DataTable table={table} onRowContextMenu={handleContextMenu}>
        <DataTableToolbar table={table}>
          <DataTableSortList table={table} />
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t("auditLog.refresh")}
          </Button>
        </DataTableToolbar>
      </DataTable>
      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          {contextMenu.data.user?.username && (
            <DropdownMenuItem
              onClick={() => {
                void copyToClipboard(contextMenu.data.user?.username ?? "");
                dismiss();
              }}
            >
              <ClipboardCopyIcon />
              {t("auditLog.contextMenu.copyUsername")}
            </DropdownMenuItem>
          )}
          {contextMenu.data.type ===
            InstanceAuditLogResponse_AuditLogEntryType.EXECUTE_COMMAND &&
            contextMenu.data.data && (
              <DropdownMenuItem
                onClick={() => {
                  void copyToClipboard(contextMenu.data.data);
                  dismiss();
                }}
              >
                <ClipboardCopyIcon />
                {t("auditLog.contextMenu.copyCommand")}
              </DropdownMenuItem>
            )}
        </ContextMenuPortal>
      )}
    </div>
  );
}

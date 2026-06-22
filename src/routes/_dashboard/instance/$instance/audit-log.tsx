import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BotIcon,
  ClipboardCopyIcon,
  PlayIcon,
  SquareIcon,
  SquareTerminalIcon,
  TextIcon,
  TimerIcon,
  TimerOffIcon,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import { MenuItem } from "@/components/context-menu-primitives.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header.tsx";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton.tsx";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list.tsx";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { SFTimeAgo } from "@/components/sf-timeago.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
import type { Timestamp } from "@/generated/google/protobuf/timestamp_pb";
import {
  type InstanceAuditLogResponse,
  type InstanceAuditLogResponse_AuditLogEntry,
  InstanceAuditLogResponse_AuditLogEntryType,
  InstanceAuditLogResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb.ts";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDataTable } from "@/hooks/use-data-table.ts";
import type { dataTableFeatures } from "@/lib/data-table-features";
import i18n from "@/lib/i18n";
import { dataTableValidateSearch } from "@/lib/parsers.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import {
  getEnumEntries,
  getEnumKeyByValue,
  mapUnionToValue,
} from "@/lib/types.ts";
import { timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

export const Route = createFileRoute(
  "/_dashboard/instance/$instance/audit-log",
)({
  validateSearch: dataTableValidateSearch,
  beforeLoad: (props) => {
    const { instance } = props.params;
    const auditLogQueryOptions = queryOptions({
      queryKey: ["instance-audit-log", instance],
      queryFn: async (props): Promise<InstanceAuditLogResponse> => {
        const transport = createTransport();
        if (transport === null) {
          return create(InstanceAuditLogResponseSchema, {
            entry: [],
          });
        }

        const instanceService = createClient(InstanceService, transport);
        const result = await instanceService.getAuditLog(
          {
            id: instance,
          },
          {
            signal: props.signal,
          },
        );

        return result;
      },
      refetchInterval: 3_000,
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
    void props.context.queryClient.prefetchQuery(
      props.context.auditLogQueryOptions,
    );
  },
  component: AuditLog,
});

function toI18nKey(type: InstanceAuditLogResponse_AuditLogEntryType) {
  switch (type) {
    case InstanceAuditLogResponse_AuditLogEntryType.START_SESSION:
      return "auditLog.startedSession";
    case InstanceAuditLogResponse_AuditLogEntryType.STOP_SESSION:
      return "auditLog.stoppedSession";
    case InstanceAuditLogResponse_AuditLogEntryType.RESUME_SESSION:
      return "auditLog.resumedSession";
    case InstanceAuditLogResponse_AuditLogEntryType.PAUSE_SESSION:
      return "auditLog.pausedSession";
    case InstanceAuditLogResponse_AuditLogEntryType.EXECUTE_COMMAND:
      return "auditLog.executedCommand";
  }
}

const logTypeToIcon = (
  type: keyof typeof InstanceAuditLogResponse_AuditLogEntryType,
) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "AUTOMATION_START":
      case "AUTOMATION_PAUSE":
      case "AUTOMATION_RESUME":
      case "AUTOMATION_STOP":
      case "AUTOMATION_UPDATE_SETTINGS":
      case "AUTOMATION_APPLY_PRESET":
      case "AUTOMATION_RESET_MEMORY":
      case "AUTOMATION_RESET_COORDINATION":
      case "AUTOMATION_RELEASE_CLAIMS":
        return BotIcon;
      case "EXECUTE_COMMAND":
        return SquareTerminalIcon;
      case "START_SESSION":
        return PlayIcon;
      case "PAUSE_SESSION":
        return TimerIcon;
      case "RESUME_SESSION":
        return TimerOffIcon;
      case "STOP_SESSION":
        return SquareIcon;
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
          username={row.original.user?.username || "Unknown"}
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
        <Badge variant="outline" className="capitalize">
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
        (type) => {
          return {
            label: type.key,
            value: type.key,
            icon: logTypeToIcon(type.key),
          };
        },
      ),
    },
    enableColumnFilter: true,
  },
  {
    id: "timestamp",
    accessorFn: (row) => timestampToDate(row.timestamp as Timestamp),
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("common:auditLog.timestamp")}
      />
    ),
    cell: ({ row }) => (
      <SFTimeAgo date={timestampToDate(row.original.timestamp as Timestamp)} />
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
    filterFn: "inNumberRange",
    enableColumnFilter: true,
  },
];

function AuditLogSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
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
  const { auditLogQueryOptions } = Route.useRouteContext();
  const { data: auditLog } = useSuspenseQuery(auditLogQueryOptions);
  const { table } = useDataTable({
    data: auditLog.entry,
    columns,
    getRowId: (row) => row.id,
  });
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<InstanceAuditLogResponse_AuditLogEntry>();
  const copyToClipboard = useCopyToClipboard();

  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <DataTable table={table} onRowContextMenu={handleContextMenu}>
        <DataTableToolbar table={table}>
          <DataTableSortList table={table} />
        </DataTableToolbar>
      </DataTable>
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          {contextMenu.data.user?.username && (
            <MenuItem
              onClick={() => {
                copyToClipboard(contextMenu.data.user?.username ?? "");
                dismiss();
              }}
            >
              <ClipboardCopyIcon />
              {t("auditLog.contextMenu.copyUsername")}
            </MenuItem>
          )}
          {contextMenu.data.type ===
            InstanceAuditLogResponse_AuditLogEntryType.EXECUTE_COMMAND &&
            contextMenu.data.data && (
              <MenuItem
                onClick={() => {
                  copyToClipboard(contextMenu.data.data);
                  dismiss();
                }}
              >
                <ClipboardCopyIcon />
                {t("auditLog.contextMenu.copyCommand")}
              </MenuItem>
            )}
        </ContextMenuPortal>
      )}
    </div>
  );
}

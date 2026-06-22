import { createClient } from "@connectrpc/connect";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, ReactTable, Row } from "@tanstack/react-table";
import {
  ClipboardCopyIcon,
  LogOutIcon,
  PencilIcon,
  PlusIcon,
  ShieldUserIcon,
  TextIcon,
  TrashIcon,
  UserIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { use, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  MenuItem,
  MenuSeparator,
} from "@/components/context-menu-primitives.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from "@/components/data-table/data-table-action-bar.tsx";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header.tsx";
import {
  SelectAllHeader,
  SelectRowHeader,
} from "@/components/data-table/data-table-selects.tsx";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton.tsx";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list.tsx";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar.tsx";
import { ManageUserDialog } from "@/components/dialog/manage-user-dialog.tsx";
import { CopyInfoButton } from "@/components/info-buttons.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { SFTimeAgo } from "@/components/sf-timeago.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
import type { Timestamp } from "@/generated/google/protobuf/timestamp_pb";
import { UserRole } from "@/generated/soulfire/common_pb.ts";
import type { UserListResponse_User } from "@/generated/soulfire/user_pb.ts";
import { UserService } from "@/generated/soulfire/user_pb.ts";
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
import { ROOT_USER_ID, runAsync, timestampToDate } from "@/lib/utils.tsx";
import { startImpersonation } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/user/admin/users")({
  validateSearch: dataTableValidateSearch,
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.users"), {
      kind: "dynamic",
      name: "users",
    }),
  component: Users,
});

const roleToIcon = (type: keyof typeof UserRole) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "USER":
        return UserIcon;
      case "ADMIN":
        return ShieldUserIcon;
    }
  });

const columns: ColumnDef<typeof dataTableFeatures, UserListResponse_User>[] = [
  {
    id: "select",
    header: SelectAllHeader,
    cell: SelectRowHeader,
    size: 32,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "username",
    accessorKey: "username",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.username")}
      />
    ),
    cell: ({ row }) => (
      <div className="flex flex-row items-center justify-start gap-2">
        <UserAvatar
          username={row.original.username}
          email={row.original.email}
          className="size-8"
        />
        <span className="max-w-64 truncate">{row.original.username}</span>
        <CopyInfoButton value={row.original.id} />
      </div>
    ),
    meta: {
      get label() {
        return i18n.t("admin:users.table.username");
      },
      get placeholder() {
        return i18n.t("admin:users.table.searchUsernames");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "email",
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.email")}
      />
    ),
    meta: {
      get label() {
        return i18n.t("admin:users.table.email");
      },
      get placeholder() {
        return i18n.t("admin:users.table.searchEmails");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "role",
    accessorFn: (row) => getEnumKeyByValue(UserRole, row.role),
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.role")}
      />
    ),
    cell: ({ cell }) => {
      const type = cell.getValue<keyof typeof UserRole>();
      const Icon = roleToIcon(type);

      return (
        <Badge variant="outline" className="capitalize">
          <Icon />
          {type}
        </Badge>
      );
    },
    meta: {
      get label() {
        return i18n.t("admin:users.table.role");
      },
      variant: "multiSelect",
      options: getEnumEntries(UserRole).map((type) => {
        return {
          label: type.key,
          value: type.key,
          icon: roleToIcon(type.key),
        };
      }),
    },
    enableColumnFilter: true,
  },
  {
    id: "createdAt",
    accessorFn: (row) => timestampToDate(row.createdAt as Timestamp),
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.createdAt")}
      />
    ),
    cell: ({ row }) => (
      <SFTimeAgo date={timestampToDate(row.original.createdAt as Timestamp)} />
    ),
    enableGlobalFilter: false,
    sortFn: "datetime",
    meta: {
      get label() {
        return i18n.t("admin:users.table.createdAt");
      },
      get placeholder() {
        return i18n.t("admin:users.table.searchCreatedAts");
      },
      variant: "dateRange",
    },
    filterFn: "inNumberRange",
    enableColumnFilter: true,
  },
  {
    id: "minIssuedAt",
    accessorFn: (row) => timestampToDate(row.minIssuedAt as Timestamp),
    accessorKey: "minIssuedAt",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.minIssuedAt")}
      />
    ),
    cell: ({ row }) => (
      <SFTimeAgo
        date={timestampToDate(row.original.minIssuedAt as Timestamp)}
      />
    ),
    enableGlobalFilter: false,
    sortFn: "datetime",
    meta: {
      get label() {
        return i18n.t("admin:users.table.minIssuedAt");
      },
      get placeholder() {
        return i18n.t("admin:users.table.searchMinIssuedAts");
      },
      variant: "dateRange",
    },
    filterFn: "inNumberRange",
    enableColumnFilter: true,
  },
  {
    id: "actions",
    header: () => <Trans i18nKey="admin:users.table.actions" />,
    cell: ({ row }) => (
      <div className="flex flex-row gap-2">
        <UpdateUserButton row={row} />
        <ImpersonateUserButton row={row} />
      </div>
    ),
    size: 64,
    enableSorting: false,
    enableHiding: false,
  },
];

function UpdateUserButton(props: {
  row: Row<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        disabled={!props.row.getCanSelect()}
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <PencilIcon />
      </Button>
      <ManageUserDialog
        mode="edit"
        user={props.row.original}
        open={open}
        setOpen={setOpen}
      />
    </>
  );
}

function ImpersonateUserButton(props: {
  row: Row<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const transport = use(TransportContext);
  const navigate = useNavigate();
  return (
    <Button
      disabled={!props.row.getCanSelect()}
      variant="secondary"
      size="sm"
      onClick={() => {
        runAsync(async () => {
          if (transport === null) {
            return;
          }

          const userService = createClient(UserService, transport);
          const token = await userService.generateUserAPIToken({
            id: props.row.original.id,
          });
          startImpersonation(token.token);
          await navigate({
            to: "/user",
            replace: true,
            reloadDocument: true,
          });
        });
      }}
    >
      <VenetianMaskIcon />
    </Button>
  );
}

function AddButton() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
        <PlusIcon />
      </Button>
      <ManageUserDialog mode="add" open={createOpen} setOpen={setCreateOpen} />
    </>
  );
}

function ExtraHeader(props: {
  table: ReactTable<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { usersQueryOptions } = Route.useRouteContext();
  const { mutateAsync: deleteUsersMutation } = useMutation({
    mutationKey: ["users", "delete-batch"],
    mutationFn: async (user: UserListResponse_User[]) => {
      if (transport === null) {
        return;
      }

      const userService = createClient(UserService, transport);
      for (const u of user) {
        await userService.deleteUser({
          id: u.id,
        });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryOptions.queryKey,
      });
    },
  });
  const { mutateAsync: invalidateUsersMutation } = useMutation({
    mutationKey: ["users", "invalidate-sessions-batch"],
    mutationFn: async (user: UserListResponse_User[]) => {
      if (transport === null) {
        return;
      }

      const userService = createClient(UserService, transport);
      for (const u of user) {
        await userService.invalidateSessions({
          id: u.id,
        });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryOptions.queryKey,
      });
    },
  });

  return (
    <>
      <DataTableActionBarAction
        tooltip={t("users.removeSelectedTooltip")}
        onClick={() => {
          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          toast.promise(deleteUsersMutation(selectedRows), {
            loading: t("users.removeToast.loading"),
            success: t("users.removeToast.success"),
            error: (e) => {
              console.error(e);
              return t("users.removeToast.error");
            },
          });
        }}
      >
        <TrashIcon />
      </DataTableActionBarAction>
      <DataTableActionBarAction
        tooltip={t("users.logOutSelectedTooltip")}
        onClick={() => {
          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          toast.promise(invalidateUsersMutation(selectedRows), {
            loading: t("users.invalidateToast.loading"),
            success: t("users.invalidateToast.success"),
            error: (e) => {
              console.error(e);
              return t("users.invalidateToast.error");
            },
          });
        }}
      >
        <LogOutIcon />
      </DataTableActionBarAction>
      <DataTableActionBarSelection table={props.table} />
    </>
  );
}

function UsersSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <DataTableSkeleton
        columnCount={7}
        filterCount={4}
        cellWidths={["2rem", "auto", "auto", "6rem", "8rem", "8rem", "4rem"]}
      />
    </div>
  );
}

function Users() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout
      showUserCrumb={false}
      extraCrumbs={[
        {
          id: "settings",
          content: t("breadcrumbs.settings"),
        },
      ]}
      pageName={t("pageName.users")}
      loadingSkeleton={<UsersSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("admin");
  const { usersQueryOptions, clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const { data: userList } = useSuspenseQuery(usersQueryOptions);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  const { table } = useDataTable({
    data: userList.users,
    columns,
    enableRowSelection: (row) =>
      row.original.id !== ROOT_USER_ID && row.original.id !== clientInfo.id,
    getRowId: (row) => row.id,
  });
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<UserListResponse_User>();
  const copyToClipboard = useCopyToClipboard();
  const [editUser, setEditUser] = useState<UserListResponse_User | null>(null);

  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <DataTable
        table={table}
        onRowContextMenu={handleContextMenu}
        actionBar={
          <DataTableActionBar table={table}>
            <ExtraHeader table={table} />
          </DataTableActionBar>
        }
      >
        <DataTableToolbar table={table}>
          <DataTableSortList table={table} />
          <AddButton />
        </DataTableToolbar>
      </DataTable>
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <MenuItem
            onClick={() => {
              setEditUser(contextMenu.data);
              dismiss();
            }}
          >
            <PencilIcon />
            {t("users.contextMenu.editUser")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              runAsync(async () => {
                if (transport === null) return;
                const userService = createClient(UserService, transport);
                const token = await userService.generateUserAPIToken({
                  id: contextMenu.data.id,
                });
                startImpersonation(token.token);
                await navigate({
                  to: "/user",
                  replace: true,
                  reloadDocument: true,
                });
              });
              dismiss();
            }}
          >
            <VenetianMaskIcon />
            {t("users.contextMenu.impersonate")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.id);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("users.contextMenu.copyUserId")}
          </MenuItem>
        </ContextMenuPortal>
      )}
      {editUser && (
        <ManageUserDialog
          mode="edit"
          user={editUser}
          open={true}
          setOpen={(open) => {
            if (!open) setEditUser(null);
          }}
        />
      )}
    </div>
  );
}

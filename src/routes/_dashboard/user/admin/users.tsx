import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

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
import { use, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/dialog/confirm-dialog.tsx";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
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
import { UserRole } from "@/generated/soulfire/common_pb";
import type { UserListResponse_User } from "@/generated/soulfire/user_pb";
import { UserService } from "@/generated/soulfire/user_pb";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDataTable } from "@/hooks/use-data-table.ts";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { calendarDateRangeFilter } from "@/lib/calendar-date-range-filter";
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
      default:
        return key satisfies never;
    }
  });

function roleLabel(role: keyof typeof UserRole) {
  return role === "ADMIN"
    ? i18n.t("admin:users.baseUserDialog.form.role.admin")
    : i18n.t("admin:users.baseUserDialog.form.role.user");
}

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
          {roleLabel(type)}
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
          label: roleLabel(type.key),
          value: type.key,
          icon: roleToIcon(type.key),
        };
      }),
    },
    filterFn: "arrHas",
    enableColumnFilter: true,
  },
  {
    id: "createdAt",
    accessorFn: (row) =>
      row.createdAt ? timestampToDate(row.createdAt) : undefined,
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.createdAt")}
      />
    ),
    cell: ({ row }) =>
      row.original.createdAt ? (
        <SFTimeAgo date={timestampToDate(row.original.createdAt)} />
      ) : null,
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
    filterFn: calendarDateRangeFilter,
    enableColumnFilter: true,
  },
  {
    id: "minIssuedAt",
    accessorFn: (row) =>
      row.minIssuedAt ? timestampToDate(row.minIssuedAt) : undefined,
    accessorKey: "minIssuedAt",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("admin:users.table.minIssuedAt")}
      />
    ),
    cell: ({ row }) =>
      row.original.minIssuedAt ? (
        <SFTimeAgo date={timestampToDate(row.original.minIssuedAt)} />
      ) : null,
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
    filterFn: calendarDateRangeFilter,
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
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={t("users.contextMenu.editUser")}
        title={t("users.contextMenu.editUser")}
        disabled={!props.row.getCanSelect()}
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
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
  const { t } = useTranslation(["admin", "common"]);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  return (
    <Button
      aria-label={t("users.contextMenu.impersonate")}
      title={t("users.contextMenu.impersonate")}
      disabled={!props.row.getCanSelect()}
      variant="secondary"
      size="sm"
      onClick={() => {
        runAsync(async () => {
          if (transport === null) {
            toast.info(t("common:demoReadOnly"));
            return;
          }

          const userService = createRpcClient(UserService, transport);
          const token = await Effect.runPromise(
            userService.generateUserAPIToken({
              id: props.row.original.id,
            }),
          );
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
  const { t } = useTranslation("admin");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("users.addUserDialog.title")}
        title={t("users.addUserDialog.title")}
        onClick={() => {
          setCreateOpen(true);
        }}
      >
        <PlusIcon />
      </Button>
      <ManageUserDialog mode="add" open={createOpen} setOpen={setCreateOpen} />
    </>
  );
}

function ExtraHeader(props: {
  table: ReactTable<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { usersQueryOptions } = Route.useRouteContext();
  const { mutateAsync: deleteUsersMutation } = useMutation({
    mutationKey: ["users", "delete-batch"],
    mutationFn: async (user: UserListResponse_User[]) => {
      if (transport === null) {
        return;
      }

      const userService = createRpcClient(UserService, transport);
      for (const u of user) {
        await Effect.runPromise(
          userService.deleteUser({
            id: u.id,
          }),
        );
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

      const userService = createRpcClient(UserService, transport);
      for (const u of user) {
        await Effect.runPromise(
          userService.invalidateSessions({
            id: u.id,
          }),
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryOptions.queryKey,
      });
    },
  });

  const [removeOpen, setRemoveOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const selectedCount = props.table.getFilteredSelectedRowModel().rows.length;

  return (
    <>
      <DataTableActionBarAction
        tooltip={t("users.removeSelectedTooltip")}
        onClick={() => {
          setRemoveOpen(true);
        }}
      >
        <TrashIcon />
      </DataTableActionBarAction>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        icon={<TrashIcon />}
        title={t("users.removeDialog.title", { count: selectedCount })}
        description={t("users.removeDialog.description")}
        confirmLabel={t("users.removeDialog.confirm")}
        onConfirm={() => {
          if (transport === null) {
            toast.info(t("common:demoReadOnly"));
            return undefined;
          }

          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          const promise = deleteUsersMutation(selectedRows);
          toast.promise(promise, {
            loading: t("users.removeToast.loading"),
            success: () => {
              props.table.resetRowSelection();
              return t("users.removeToast.success");
            },
            error: (e) => {
              console.error(e);
              return t("users.removeToast.error");
            },
          });
          return promise;
        }}
      />
      <DataTableActionBarAction
        tooltip={t("users.logOutSelectedTooltip")}
        onClick={() => {
          setSignOutOpen(true);
        }}
      >
        <LogOutIcon />
      </DataTableActionBarAction>
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        icon={<LogOutIcon />}
        title={t("users.invalidateDialog.title", { count: selectedCount })}
        description={t("users.invalidateDialog.description")}
        confirmLabel={t("users.invalidateDialog.confirm")}
        onConfirm={() => {
          if (transport === null) {
            toast.info(t("common:demoReadOnly"));
            return undefined;
          }

          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          const promise = invalidateUsersMutation(selectedRows);
          toast.promise(promise, {
            loading: t("users.invalidateToast.loading"),
            success: t("users.invalidateToast.success"),
            error: (e) => {
              console.error(e);
              return t("users.invalidateToast.error");
            },
          });
          return promise;
        }}
      />
      <DataTableActionBarSelection table={props.table} />
    </>
  );
}

function UsersSkeleton() {
  return (
    <div className="container flex size-full grow flex-col gap-4">
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
          id: "admin",
          content: t("breadcrumbs.admin"),
        },
      ]}
      pageName={t("pageName.users")}
      loadingSkeleton={<UsersSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

// Phones hide the date columns so the username, email, and role fit on screen.
// The view options menu that could restore them only shows on wide screens.
function phoneColumnVisibility(isMobile: boolean) {
  return { createdAt: !isMobile, minIssuedAt: !isMobile };
}

function Content() {
  const { t } = useTranslation(["admin", "common"]);
  const { usersQueryOptions, clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const { data: userList } = useSuspenseQuery(usersQueryOptions);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { table } = useDataTable({
    data: userList.users,
    columns,
    initialState: {
      columnVisibility: phoneColumnVisibility(isMobile),
    },
    enableRowSelection: (row) =>
      row.original.id !== ROOT_USER_ID && row.original.id !== clientInfo.id,
    getRowId: (row) => row.id,
  });
  useEffect(() => {
    table.setColumnVisibility((visibility) => ({
      ...visibility,
      ...phoneColumnVisibility(isMobile),
    }));
  }, [table, isMobile]);
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<UserListResponse_User>();
  const copyToClipboard = useCopyToClipboard();
  const [editUser, setEditUser] = useState<UserListResponse_User | null>(null);

  return (
    <div className="container flex size-full grow flex-col gap-4">
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
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <DropdownMenuItem
            onClick={() => {
              setEditUser(contextMenu.data);
              dismiss();
            }}
          >
            <PencilIcon />
            {t("users.contextMenu.editUser")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              runAsync(async () => {
                if (transport === null) {
                  toast.info(t("common:demoReadOnly"));
                  return;
                }
                const userService = createRpcClient(UserService, transport);
                const token = await Effect.runPromise(
                  userService.generateUserAPIToken({
                    id: contextMenu.data.id,
                  }),
                );
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
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void copyToClipboard(contextMenu.data.id);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("users.contextMenu.copyUserId")}
          </DropdownMenuItem>
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

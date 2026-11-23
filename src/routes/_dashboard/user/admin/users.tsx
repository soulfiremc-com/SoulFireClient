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
  LockIcon,
  LogOutIcon,
  PencilIcon,
  PlusIcon,
  ShieldUserIcon,
  TextIcon,
  TrashIcon,
  UserIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { createContext, use, useEffect, useState } from "react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
import type { ClientDataResponse } from "@/generated/soulfire/client_pb";
import { GlobalPermission, UserRole } from "@/generated/soulfire/common_pb";
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
import {
  hasGlobalPermission,
  ROOT_USER_ID,
  timestampToDate,
} from "@/lib/utils.tsx";
import { settleEach } from "@/lib/settle-each.ts";
import { startImpersonation } from "@/lib/web-rpc.ts";

export const Route = createFileRoute("/_dashboard/user/admin/users")({
  validateSearch: dataTableValidateSearch,
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.users"), {
      kind: "dynamic",
      name: "users",
    }),
  loader: (props) => {
    const { queryClient, clientDataQueryOptions, usersQueryOptions } =
      props.context;
    // Listing users needs READ_USER. Without it the request always fails.
    void queryClient
      .ensureQueryData(clientDataQueryOptions)
      .then((clientInfo) =>
        hasGlobalPermission(clientInfo, GlobalPermission.READ_USER)
          ? queryClient.prefetchQuery(usersQueryOptions)
          : undefined,
      )
      .catch(() => {
        // The page reads client data itself and shows its error state.
      });
  },
  component: Users,
});

const roleToIcon = (type: keyof typeof UserRole) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "USER": {
        return UserIcon;
      }
      case "ADMIN": {
        return ShieldUserIcon;
      }
      default: {
        return key satisfies never;
      }
    }
  });

function roleLabel(role: keyof typeof UserRole) {
  return role === "ADMIN"
    ? i18n.t("admin:users.baseUserDialog.form.role.admin")
    : i18n.t("admin:users.baseUserDialog.form.role.user");
}

// The server rejects edits and tokens for the root user and for the caller.
function isManageableUser(
  user: UserListResponse_User,
  clientInfo: ClientDataResponse,
) {
  return user.id !== ROOT_USER_ID && user.id !== clientInfo.id;
}

function useUserPermissions() {
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const can = (permission: GlobalPermission) =>
    hasGlobalPermission(clientInfo, permission);
  return {
    clientInfo,
    read: can(GlobalPermission.READ_USER),
    create: can(GlobalPermission.CREATE_USER),
    update: can(GlobalPermission.UPDATE_USER),
    remove: can(GlobalPermission.DELETE_USER),
    invalidate: can(GlobalPermission.INVALIDATE_SESSIONS),
    impersonate: can(GlobalPermission.GENERATE_API_TOKEN),
  };
}

function useImpersonateUser() {
  const { t } = useTranslation(["admin", "common"]);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  return async (userId: string) => {
    if (transport === null) {
      toast.info(t("common:demoReadOnly"));
      return;
    }
    try {
      const token = await Effect.runPromise(
        createRpcClient(UserService, transport).generateUserAPIToken({
          id: userId,
        }),
      );
      startImpersonation(token.token);
      await navigate({
        to: "/user",
        replace: true,
        reloadDocument: true,
      });
    } catch (error) {
      console.error(error);
      toast.error(t("users.impersonateToast.error"));
    }
  };
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
        <span className="max-w-64 truncate" title={row.original.username}>
          {row.original.username}
        </span>
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
      options: getEnumEntries(UserRole).map((type) => ({
        label: roleLabel(type.key),
        value: type.key,
        icon: roleToIcon(type.key),
      })),
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

// Rows open the one edit dialog that the table renders.
const EditUserContext = createContext<(user: UserListResponse_User) => void>(
  () => {},
);

function UpdateUserButton(props: {
  row: Row<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const { t } = useTranslation("admin");
  const editUser = use(EditUserContext);
  const permissions = useUserPermissions();
  if (!permissions.update) return null;

  return (
    <Button
      aria-label={t("users.contextMenu.editUser")}
      title={t("users.contextMenu.editUser")}
      disabled={!isManageableUser(props.row.original, permissions.clientInfo)}
      variant="secondary"
      size="sm"
      onClick={() => {
        editUser(props.row.original);
      }}
    >
      <PencilIcon />
    </Button>
  );
}

function ImpersonateUserButton(props: {
  row: Row<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const { t } = useTranslation("admin");
  const permissions = useUserPermissions();
  const impersonate = useImpersonateUser();
  if (!permissions.impersonate) return null;
  return (
    <Button
      aria-label={t("users.contextMenu.impersonate")}
      title={t("users.contextMenu.impersonate")}
      disabled={!isManageableUser(props.row.original, permissions.clientInfo)}
      variant="secondary"
      size="sm"
      onClick={() => {
        void impersonate(props.row.original.id);
      }}
    >
      <VenetianMaskIcon />
    </Button>
  );
}

function AddButton() {
  const { t } = useTranslation("admin");
  const [createOpen, setCreateOpen] = useState(false);
  const permissions = useUserPermissions();
  if (!permissions.create) return null;

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

type BatchAction = "remove" | "invalidate";

const batchToastKeys = {
  remove: "users.removeToast",
  invalidate: "users.invalidateToast",
} as const;

function ExtraHeader(props: {
  table: ReactTable<typeof dataTableFeatures, UserListResponse_User>;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { usersQueryOptions } = Route.useRouteContext();
  const { mutateAsync: runBatch } = useMutation({
    mutationKey: ["users", "batch"],
    mutationFn: ({
      action,
      users,
    }: {
      action: BatchAction;
      users: UserListResponse_User[];
    }) => {
      if (transport === null) {
        throw new Error("The demo cannot change users");
      }
      const userService = createRpcClient(UserService, transport);
      return settleEach(users, (user) =>
        action === "remove"
          ? Effect.runPromise(userService.deleteUser({ id: user.id }))
          : Effect.runPromise(userService.invalidateSessions({ id: user.id })),
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryOptions.queryKey,
      });
    },
  });

  async function confirmBatch(action: BatchAction) {
    if (transport === null) {
      toast.info(t("common:demoReadOnly"));
      return;
    }

    const users = props.table
      .getFilteredSelectedRowModel()
      .rows.map((row) => row.original);
    const keys = batchToastKeys[action];
    const toastId = toast.loading(t(`${keys}.loading`));
    try {
      const { succeeded, failed } = await runBatch({ action, users });
      for (const { error } of failed) {
        console.error(error);
      }
      // Failed rows stay selected so the admin can retry them.
      const succeededIds = new Set(succeeded.map((user) => user.id));
      props.table.setRowSelection((selection) =>
        Object.fromEntries(
          Object.entries(selection).filter(([id]) => !succeededIds.has(id)),
        ),
      );
      if (failed.length === 0) {
        toast.success(t(`${keys}.success`, { count: succeeded.length }), {
          id: toastId,
        });
      } else if (succeeded.length === 0) {
        toast.error(t(`${keys}.error`, { count: failed.length }), {
          id: toastId,
        });
      } else {
        toast.warning(
          t(`${keys}.partial`, {
            succeeded: succeeded.length,
            failed: failed.length,
            total: users.length,
          }),
          { id: toastId },
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(t(`${keys}.error`, { count: users.length }), {
        id: toastId,
      });
    }
  }

  const [removeOpen, setRemoveOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const selectedCount = props.table.getFilteredSelectedRowModel().rows.length;
  const permissions = useUserPermissions();

  return (
    <>
      {permissions.remove && (
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
            onConfirm={() => confirmBatch("remove")}
          />
        </>
      )}
      {permissions.invalidate && (
        <>
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
            onConfirm={() => confirmBatch("invalidate")}
          />
        </>
      )}
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
  const { t } = useTranslation("admin");
  const permissions = useUserPermissions();
  if (!permissions.read) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t("users.noPermission.title")}</EmptyTitle>
          <EmptyDescription>
            {t("users.noPermission.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <UsersTable />;
}

function UsersTable() {
  const { t } = useTranslation(["admin", "common"]);
  const { usersQueryOptions } = Route.useRouteContext();
  const permissions = useUserPermissions();
  const { clientInfo } = permissions;
  const { data: userList } = useSuspenseQuery(usersQueryOptions);
  const impersonate = useImpersonateUser();
  const isMobile = useIsMobile();
  const { table } = useDataTable({
    data: userList.users,
    columns,
    initialState: {
      columnVisibility: phoneColumnVisibility(isMobile),
    },
    // Selection only serves the bulk actions, so it needs one of them.
    enableRowSelection: (row) =>
      (permissions.remove || permissions.invalidate) &&
      isManageableUser(row.original, clientInfo),
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
  const manageable =
    contextMenu !== null && isManageableUser(contextMenu.data, clientInfo);
  const canEdit = manageable && permissions.update;
  const canImpersonate = manageable && permissions.impersonate;

  return (
    <EditUserContext value={setEditUser}>
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
            {canEdit && (
              <DropdownMenuItem
                onClick={() => {
                  setEditUser(contextMenu.data);
                  dismiss();
                }}
              >
                <PencilIcon />
                {t("users.contextMenu.editUser")}
              </DropdownMenuItem>
            )}
            {canImpersonate && (
              <DropdownMenuItem
                onClick={() => {
                  void impersonate(contextMenu.data.id);
                  dismiss();
                }}
              >
                <VenetianMaskIcon />
                {t("users.contextMenu.impersonate")}
              </DropdownMenuItem>
            )}
            {(canEdit || canImpersonate) && <DropdownMenuSeparator />}
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
            open
            setOpen={(open) => {
              if (!open) setEditUser(null);
            }}
          />
        )}
      </div>
    </EditUserContext>
  );
}

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, ReactTable } from "@tanstack/react-table";
import {
  BracesIcon,
  ClipboardCopyIcon,
  SettingsIcon,
  TextIcon,
  TrashIcon,
} from "lucide-react";
import { createContext, use, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddAccountsMenu } from "@/components/accounts/add-accounts-menu.tsx";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
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
import { AccountConfigDialog } from "@/components/dialog/account-config-dialog.tsx";
import { AccountMetadataDialog } from "@/components/dialog/account-metadata-dialog.tsx";
import { ConfirmDialog } from "@/components/dialog/confirm-dialog.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { InstanceSettingsPageComponent } from "@/components/settings-page.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { MinecraftAccountProto_AccountTypeProto } from "@/generated/soulfire/common_pb";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDataTable } from "@/hooks/use-data-table.ts";
import {
  accountTypeToIcon,
  translateAccountType,
} from "@/lib/account-types.ts";
import type { dataTableFeatures } from "@/lib/data-table-features";
import i18n from "@/lib/i18n";
import { guidedTableValidateSearch } from "@/lib/parsers.ts";
import { requireField } from "@/lib/require-field";
import { routeChrome } from "@/lib/route-title.ts";
import { PAGE_HIDDEN_SETTINGS } from "@/lib/settings-discovery.ts";
import {
  getEnumEntries,
  getEnumKeyByValue,
  type InstanceInfoQueryData,
  type ProfileAccount,
} from "@/lib/types.ts";
import { toastMutation } from "@/lib/error-toast.ts";
import { removeInstanceAccountsBatch } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/instance/$instance/accounts")(
  {
    validateSearch: guidedTableValidateSearch,
    beforeLoad: ({ context }) =>
      routeChrome({
        getTitle: () => i18n.t("common:pageName.accountSettings"),
        getIcon: () => {
          const instanceInfo =
            context.queryClient.getQueryData<InstanceInfoQueryData>(
              context.instanceInfoQueryOptions.queryKey,
            );
          const accountPage = instanceInfo?.instanceSettings.find(
            (page) => page.id === "account",
          );

          return {
            kind: "dynamic",
            name: accountPage?.iconId ?? "users",
          };
        },
      }),
    component: AccountSettings,
  },
);

/// Opens the page level account dialogs, so rows do not mount their own copies.
const AccountDialogsContext = createContext<{
  openConfig: (profileId: string) => void;
  openMetadata: (profileId: string) => void;
} | null>(null);

function ActionsCell({ account }: { account: ProfileAccount }) {
  const { t } = useTranslation("instance");
  const dialogs = use(AccountDialogsContext);
  if (dialogs === null) {
    throw new Error("ActionsCell must render inside AccountDialogsContext");
  }

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => {
                dialogs.openConfig(account.profileId);
              }}
            />
          }
        >
          <SettingsIcon className="size-4" />
          <span className="sr-only">{t("account.config.openButton")}</span>
        </TooltipTrigger>
        <TooltipContent>{t("account.config.openButton")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => {
                dialogs.openMetadata(account.profileId);
              }}
            />
          }
        >
          <BracesIcon className="size-4" />
          <span className="sr-only">{t("account.metadata.openButton")}</span>
        </TooltipTrigger>
        <TooltipContent>{t("account.metadata.openButton")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

const columns: ColumnDef<typeof dataTableFeatures, ProfileAccount>[] = [
  {
    id: "select",
    header: SelectAllHeader,
    cell: SelectRowHeader,
    size: 32,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "type",
    accessorFn: (row) =>
      getEnumKeyByValue(MinecraftAccountProto_AccountTypeProto, row.type),
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:account.table.type")}
      />
    ),
    cell: ({ cell }) => {
      const type =
        cell.getValue<keyof typeof MinecraftAccountProto_AccountTypeProto>();
      const Icon = accountTypeToIcon(type);

      return (
        <Badge variant="outline">
          <Icon />
          {translateAccountType(i18n, type)}
        </Badge>
      );
    },
    meta: {
      get label() {
        return i18n.t("instance:account.table.type");
      },
      variant: "multiSelect",
      get options() {
        return getEnumEntries(MinecraftAccountProto_AccountTypeProto).map(
          (type) => ({
            label: translateAccountType(i18n, type.key),
            value: type.key,
            icon: accountTypeToIcon(type.key),
          }),
        );
      },
    },
    filterFn: "arrHas",
    enableColumnFilter: true,
  },
  {
    id: "profileId",
    accessorKey: "profileId",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:account.table.profileId")}
      />
    ),
    meta: {
      get label() {
        return i18n.t("instance:account.table.profileId");
      },
      get placeholder() {
        return i18n.t("instance:account.table.searchProfileIds");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "lastKnownName",
    accessorKey: "lastKnownName",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:account.table.lastKnownName")}
      />
    ),
    meta: {
      get label() {
        return i18n.t("instance:account.table.lastKnownName");
      },
      get placeholder() {
        return i18n.t("instance:account.table.searchLastKnownNames");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "actions",
    header: () => (
      <span className="sr-only">
        {i18n.t("instance:account.table.actions")}
      </span>
    ),
    cell: ({ row }) => <ActionsCell account={row.original} />,
    size: 80,
    enableSorting: false,
    enableHiding: false,
  },
];

function ExtraHeader(props: {
  table: ReactTable<typeof dataTableFeatures, ProfileAccount>;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  // Batch remove accounts mutation
  const { mutateAsync: removeAccountsBatchMutation } = useMutation({
    mutationKey: ["instance", "accounts", "remove-batch", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
    onMutate: () => {
      props.table.resetRowSelection();
    },
    mutationFn: async (profileIds: string[]) => {
      await removeInstanceAccountsBatch(
        profileIds,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: instanceInfoQueryOptions.queryKey,
      });
    },
  });

  const [removeOpen, setRemoveOpen] = useState(false);
  const selectedCount = props.table.getFilteredSelectedRowModel().rows.length;

  return (
    <>
      <DataTableActionBarAction
        tooltip={t("account.removeSelectedTooltip")}
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
        title={t("account.removeDialog.title", { count: selectedCount })}
        description={t("account.removeDialog.description")}
        confirmLabel={t("account.removeDialog.confirm")}
        onConfirm={() => {
          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          void toastMutation(
            removeAccountsBatchMutation(selectedRows.map((r) => r.profileId)),
            {
              loading: t("account.removeToast.loading"),
              success: t("account.removeToast.success", {
                count: selectedRows.length,
              }),
              error: t("account.removeToast.error"),
            },
          ).catch(() => undefined);
        }}
      />
      <DataTableActionBarSelection table={props.table} />
    </>
  );
}

function AccountSettingsSkeleton() {
  const { t } = useTranslation("instance");
  return (
    <div className="container flex size-full grow flex-col gap-8">
      <DataTableSkeleton
        columnCount={5}
        filterCount={3}
        cellWidths={["2rem", "8rem", "auto", "auto", "5rem"]}
      />
      <div className="flex flex-col gap-4 border-t pt-6">
        <h2 className="text-lg font-semibold">{t("account.settingsTitle")}</h2>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function AccountSettings() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.accountSettings")}
      documentationLink="https://soulfiremc.com/docs/usage/accounts?utm_source=soulfire-client&utm_medium=app&utm_campaign=accounts-docs"
      loadingSkeleton={<AccountSettingsSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("instance");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  // Exact setting links come from search and keep the table params intact.
  const focusNamespace = Route.useSearch({
    select: (search) => search.focusNamespace,
  });
  const focusKey = Route.useSearch({ select: (search) => search.focusKey });
  const guide = Route.useSearch({ select: (search) => search.guide });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const { table } = useDataTable({
    data: profile.accounts,
    columns,
    getRowId: (row) => row.profileId,
  });
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<ProfileAccount>();
  const copyToClipboard = useCopyToClipboard();
  const [configAccountId, setConfigAccountId] = useState<string | null>(null);
  const [metadataAccountId, setMetadataAccountId] = useState<string | null>(
    null,
  );
  const configAccount = profile.accounts.find(
    (account) => account.profileId === configAccountId,
  );
  const metadataAccount = profile.accounts.find(
    (account) => account.profileId === metadataAccountId,
  );
  const accountDialogs = useMemo(
    () => ({
      openConfig: setConfigAccountId,
      openMetadata: setMetadataAccountId,
    }),
    [],
  );

  return (
    <div className="container flex size-full grow flex-col gap-8">
      <AccountDialogsContext value={accountDialogs}>
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
            <AddAccountsMenu guide={guide} />
          </DataTableToolbar>
        </DataTable>
      </AccountDialogsContext>
      <section
        aria-labelledby="account-settings-heading"
        className="flex flex-col gap-4 border-t pt-6"
      >
        <h2 id="account-settings-heading" className="text-lg font-semibold">
          {t("account.settingsTitle")}
        </h2>
        <InstanceSettingsPageComponent
          data={requireField(
            instanceInfo.instanceSettings.find((s) => s.id === "account"),
            "the account settings page",
          )}
          disabledIds={PAGE_HIDDEN_SETTINGS["account"]}
          focusSetting={
            focusNamespace && focusKey
              ? { namespace: focusNamespace, key: focusKey }
              : undefined
          }
        />
      </section>
      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <DropdownMenuItem
            onClick={() => {
              setConfigAccountId(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <SettingsIcon />
            {t("account.contextMenu.openConfig")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setMetadataAccountId(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <BracesIcon />
            {t("account.contextMenu.openMetadata")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void copyToClipboard(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("account.contextMenu.copyProfileId")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void copyToClipboard(contextMenu.data.lastKnownName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("account.contextMenu.copyUsername")}
          </DropdownMenuItem>
        </ContextMenuPortal>
      )}
      {configAccount && (
        <AccountConfigDialog
          account={configAccount}
          open
          onOpenChange={(open) => {
            if (!open) setConfigAccountId(null);
          }}
        />
      )}
      {metadataAccount && (
        <AccountMetadataDialog
          account={metadataAccount}
          open
          onOpenChange={(open) => {
            if (!open) setMetadataAccountId(null);
          }}
        />
      )}
    </div>
  );
}

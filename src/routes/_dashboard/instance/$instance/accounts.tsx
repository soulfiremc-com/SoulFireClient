import { useAptabase } from "@aptabase/react";
import { createClient } from "@connectrpc/connect";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, ReactTable } from "@tanstack/react-table";
import {
  BracesIcon,
  ClipboardCopyIcon,
  PlusIcon,
  SettingsIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TextIcon,
  TrashIcon,
} from "lucide-react";
import { use, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
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
import { AccountConfigDialog } from "@/components/dialog/account-config-dialog.tsx";
import { AccountMetadataDialog } from "@/components/dialog/account-metadata-dialog.tsx";
import {
  type DeviceCodeData,
  DeviceCodeDialog,
} from "@/components/dialog/device-code-dialog.tsx";
import GenerateAccountsDialog from "@/components/dialog/generate-accounts-dialog.tsx";
import ImportDialog from "@/components/dialog/import-dialog.tsx";
import RavealtsDialog from "@/components/dialog/ravealts-dialog.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  type DisabledSettingId,
  InstanceSettingFieldByKey,
  InstanceSettingsPageComponent,
} from "@/components/settings-page.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import type { SettingsPage } from "@/generated/soulfire/common_pb";
import {
  AccountTypeCredentials,
  AccountTypeDeviceCode,
  MinecraftAccountProto_AccountTypeProto,
} from "@/generated/soulfire/common_pb.ts";
import { MCAuthService } from "@/generated/soulfire/mc-auth_pb.ts";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDataTable } from "@/hooks/use-data-table.ts";
import {
  accountTypeToIcon,
  translateAccountType,
} from "@/lib/account-types.ts";
import type { dataTableFeatures } from "@/lib/data-table-features";
import i18n from "@/lib/i18n";
import { dataTableValidateSearch } from "@/lib/parsers.ts";
import { observeServerStream } from "@/lib/protobuf.ts";
import { routeChrome } from "@/lib/route-title.ts";
import {
  type GenerateAccountsMode,
  getEnumEntries,
  getEnumKeyByValue,
  type InstanceInfoQueryData,
  type ProfileAccount,
} from "@/lib/types.ts";
import {
  addInstanceAccount,
  addInstanceAccountsBatch,
  applyGeneratedAccounts,
  removeInstanceAccountsBatch,
  updateInstanceConfigEntry,
} from "@/lib/utils.tsx";

const ACCOUNT_SETTINGS_DISABLED_IDS: DisabledSettingId[] = [
  { namespace: "account", key: "account-import-concurrency" },
  { namespace: "account", key: "use-proxies-for-account-auth" },
];

function GetAccountsButton() {
  const { t } = useTranslation("instance");

  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={
        <ExternalLink href="https://soulfiremc.com/get-accounts?utm_source=soulfire-client&utm_medium=app&utm_campaign=accounts-get" />
      }
    >
      <ShoppingCartIcon />
      {t("account.getAccounts")}
    </Button>
  );
}

function GenerateAccountsButton() {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const { trackEvent } = useAptabase();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { mutateAsync: applyGeneratedAccountsMutation } = useMutation({
    mutationKey: ["instance", "accounts", "generate", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
    mutationFn: async ({
      newAccounts,
      mode,
    }: {
      newAccounts: ProfileAccount[];
      mode: GenerateAccountsMode;
    }) => {
      await applyGeneratedAccounts(
        newAccounts,
        mode,
        profile.accounts,
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

  const existingUsernames = useMemo(
    () => new Set(profile.accounts.map((a) => a.lastKnownName)),
    [profile.accounts],
  );

  const handleGenerate = useCallback(
    async (newAccounts: ProfileAccount[], mode: GenerateAccountsMode) => {
      void trackEvent("generate_accounts", { count: newAccounts.length, mode });
      await applyGeneratedAccountsMutation({ newAccounts, mode });
    },
    [applyGeneratedAccountsMutation, trackEvent],
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
        <SparklesIcon />
        {t("account.generateAccounts")}
      </Button>
      <GenerateAccountsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGenerate={handleGenerate}
        existingUsernames={existingUsernames}
      />
    </>
  );
}

export const Route = createFileRoute("/_dashboard/instance/$instance/accounts")(
  {
    validateSearch: dataTableValidateSearch,
    beforeLoad: () =>
      routeChrome({
        getTitle: () => i18n.t("common:pageName.accountSettings"),
        getIcon: (match) => {
          const iconContext = match.context as {
            queryClient: QueryClient;
            instanceInfoQueryOptions: {
              queryKey: readonly unknown[];
            };
          };
          const instanceInfo =
            iconContext.queryClient.getQueryData<InstanceInfoQueryData>(
              iconContext.instanceInfoQueryOptions.queryKey,
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

function _addAndDeduplicate(
  accounts: ProfileAccount[],
  newAccounts: ProfileAccount[],
) {
  const newAccountsSet = new Set(newAccounts.map((a) => a.profileId));
  return accounts
    .filter((a) => !newAccountsSet.has(a.profileId))
    .concat(newAccounts);
}

function splitAccountCredentialPayloads(
  text: string,
  accountType: AccountTypeCredentials,
) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  if (
    accountType === AccountTypeCredentials.MICROSOFT_JAVA_COOKIES &&
    (looksLikeCookieJar(trimmed) || looksLikeCookieEditorJson(trimmed))
  ) {
    return trimmed
      .split(/(?:\r?\n){2,}/)
      .map((payload) => payload.trim())
      .filter((payload) => payload.length > 0);
  }

  return text
    .split(/\r?\n/)
    .map((payload) => payload.trim())
    .filter((payload) => payload.length > 0);
}

function looksLikeCookieJar(input: string) {
  const hasLiveCookieMarker =
    input.includes("__Host-MSAAUTHP") ||
    input.includes("login.live.com") ||
    input.includes("\tMSPAuth\t") ||
    input.includes("\tMSPProf\t") ||
    input.includes("\tPPLState\t");
  return input.includes("\t") && hasLiveCookieMarker;
}

function looksLikeCookieEditorJson(input: string) {
  return (
    input.startsWith("[") &&
    input.endsWith("]") &&
    input.includes('"name"') &&
    input.includes('"value"')
  );
}

function ActionsCell({ account }: { account: ProfileAccount }) {
  const { t } = useTranslation("instance");
  const [configOpen, setConfigOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setConfigOpen(true)}
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
              onClick={() => setMetadataOpen(true)}
            />
          }
        >
          <BracesIcon className="size-4" />
          <span className="sr-only">{t("account.metadata.openButton")}</span>
        </TooltipTrigger>
        <TooltipContent>{t("account.metadata.openButton")}</TooltipContent>
      </Tooltip>
      <AccountConfigDialog
        account={account}
        open={configOpen}
        onOpenChange={setConfigOpen}
      />
      <AccountMetadataDialog
        account={account}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />
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
          (type) => {
            return {
              label: translateAccountType(i18n, type.key),
              value: type.key,
              icon: accountTypeToIcon(type.key),
            };
          },
        );
      },
    },
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

function AddButton() {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const { trackEvent } = useAptabase();
  // Batch add accounts mutation for bulk import
  const { mutateAsync: addAccountsBatchMutation } = useMutation({
    mutationKey: ["instance", "accounts", "add-batch", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
    mutationFn: async (accounts: ProfileAccount[]) => {
      await addInstanceAccountsBatch(
        accounts,
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
  // Granular account add mutation for single account (device code)
  const { mutateAsync: addAccountMutation } = useMutation({
    mutationKey: ["instance", "accounts", "add", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
    mutationFn: async (account: ProfileAccount) => {
      await addInstanceAccount(
        account,
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
  const [accountTypeCredentialsSelected, setAccountTypeCredentialsSelected] =
    useState<AccountTypeCredentials | null>(null);
  const [deviceCodeData, setDeviceCodeData] = useState<DeviceCodeData | null>(
    null,
  );
  const [pendingDeviceCodeType, setPendingDeviceCodeType] =
    useState<AccountTypeDeviceCode | null>(null);
  const [ravealtsDialogOpen, setRavealtsDialogOpen] = useState(false);

  const handleRavealtsImport = useCallback(
    (payload: string[], credentialType: AccountTypeCredentials) => {
      if (transport === null) return;

      void trackEvent("ravealts_purchase", {
        count: payload.length,
        type: credentialType,
      });

      const service = createClient(MCAuthService, transport);
      const abortController = new AbortController();
      const loadingData: ExternalToast = {
        cancel: {
          label: t("common:cancel"),
          onClick: () => {
            abortController.abort();
          },
        },
      };
      const total = payload.length;
      let failed = 0;
      let success = 0;
      const accountsToAdd: ProfileAccount[] = [];
      const loadingReport = () =>
        t("account.listImportToast.loading", {
          checked: success + failed,
          total,
          success,
          failed,
        });
      const toastId = toast.loading(loadingReport(), loadingData);
      const responses = service.loginCredentials(
        {
          instanceId: instanceInfo.id,
          service: credentialType,
          payload,
        },
        {
          signal: abortController.signal,
        },
      );
      void observeServerStream(responses, {
        onMessage: async (r) => {
          const data = r.data;
          switch (data.case) {
            case "oneSuccess": {
              if (abortController.signal.aborted) return;
              if (data.value.account) {
                accountsToAdd.push(data.value.account);
              }
              success++;
              toast.loading(loadingReport(), {
                id: toastId,
                ...loadingData,
              });
              break;
            }
            case "oneFailure": {
              if (abortController.signal.aborted) return;
              failed++;
              toast.loading(loadingReport(), {
                id: toastId,
                ...loadingData,
              });
              break;
            }
            case "end": {
              if (accountsToAdd.length > 0) {
                await addAccountsBatchMutation(accountsToAdd);
              }
              if (accountsToAdd.length === 0) {
                toast.error(t("account.listImportToast.allFailed"), {
                  id: toastId,
                  cancel: undefined,
                });
              } else if (failed > 0) {
                toast.warning(
                  t("account.listImportToast.someFailed", {
                    count: accountsToAdd.length,
                    failed,
                  }),
                  { id: toastId, cancel: undefined },
                );
              } else {
                toast.success(
                  t("account.listImportToast.noneFailed", {
                    count: accountsToAdd.length,
                  }),
                  { id: toastId, cancel: undefined },
                );
              }
              break;
            }
          }
        },
        onError: (e) => {
          console.error(e);
          toast.error(t("account.listImportToast.error"), {
            id: toastId,
            cancel: undefined,
          });
        },
      });
    },
    [instanceInfo.id, addAccountsBatchMutation, t, transport, trackEvent],
  );

  const textSelectedCallback = useCallback(
    (text: string) => {
      if (accountTypeCredentialsSelected === null) return;

      if (text.length === 0) {
        toast.error(t("account.listImportToast.noAccounts"));
        return;
      }

      setAccountTypeCredentialsSelected(null);

      if (transport === null) {
        return;
      }

      const textSplit = splitAccountCredentialPayloads(
        text,
        accountTypeCredentialsSelected,
      );
      const service = createClient(MCAuthService, transport);

      const abortController = new AbortController();
      const loadingData: ExternalToast = {
        cancel: {
          label: t("common:cancel"),
          onClick: () => {
            abortController.abort();
          },
        },
      };
      const total = textSplit.length;
      let failed = 0;
      let success = 0;
      const accountsToAdd: ProfileAccount[] = [];
      const loadingReport = () =>
        t("account.listImportToast.loading", {
          checked: success + failed,
          total,
          success,
          failed,
        });
      const toastId = toast.loading(loadingReport(), loadingData);
      const responses = service.loginCredentials(
        {
          instanceId: instanceInfo.id,
          service: accountTypeCredentialsSelected,
          payload: textSplit,
        },
        {
          signal: abortController.signal,
        },
      );
      void observeServerStream(responses, {
        onMessage: async (r) => {
          const data = r.data;
          switch (data.case) {
            case "oneSuccess": {
              if (abortController.signal.aborted) {
                return;
              }

              if (data.value.account) {
                accountsToAdd.push(data.value.account);
              }
              success++;
              toast.loading(loadingReport(), {
                id: toastId,
                ...loadingData,
              });
              break;
            }
            case "oneFailure": {
              if (abortController.signal.aborted) {
                return;
              }

              failed++;
              toast.loading(loadingReport(), {
                id: toastId,
                ...loadingData,
              });
              break;
            }
            case "end": {
              if (accountsToAdd.length > 0) {
                await addAccountsBatchMutation(accountsToAdd);
              }

              if (accountsToAdd.length === 0) {
                toast.error(t("account.listImportToast.allFailed"), {
                  id: toastId,
                  cancel: undefined,
                });
              } else if (failed > 0) {
                toast.warning(
                  t("account.listImportToast.someFailed", {
                    count: accountsToAdd.length,
                    failed,
                  }),
                  {
                    id: toastId,
                    cancel: undefined,
                  },
                );
              } else {
                toast.success(
                  t("account.listImportToast.noneFailed", {
                    count: accountsToAdd.length,
                  }),
                  {
                    id: toastId,
                    cancel: undefined,
                  },
                );
              }
              break;
            }
          }
        },
        onError: (e) => {
          console.error(e);
          toast.error(t("account.listImportToast.error"), {
            id: toastId,
            cancel: undefined,
          });
        },
      });
    },
    [
      accountTypeCredentialsSelected,
      instanceInfo.id,
      addAccountsBatchMutation,
      t,
      transport,
    ],
  );

  const deviceCodeSelected = useCallback(
    (type: AccountTypeDeviceCode) => {
      if (transport === null) {
        return;
      }

      const abortController = new AbortController();
      const service = createClient(MCAuthService, transport);
      toast.promise(
        (async () => {
          const promise = new Promise<ProfileAccount>((resolve, reject) => {
            try {
              const responses = service.loginDeviceCode(
                {
                  instanceId: instanceInfo.id,
                  service: type,
                },
                {
                  signal: abortController.signal,
                },
              );
              void observeServerStream(responses, {
                onMessage: (message) => {
                  if (message.data.case === "account") {
                    setDeviceCodeData(null);
                    resolve(message.data.value);
                  } else if (message.data.case === "deviceCode") {
                    setDeviceCodeData({
                      userCode: message.data.value.userCode,
                      verificationUri: message.data.value.verificationUri,
                      directVerificationUri:
                        message.data.value.directVerificationUri,
                    });
                  }
                },
                onError: (e) => {
                  console.error(e);
                  setDeviceCodeData(null);
                  reject(new Error(t("account.unknownError")));
                },
              });
            } catch (e) {
              setDeviceCodeData(null);
              if (e instanceof Error) {
                reject(e);
              } else {
                reject(new Error(t("account.unknownError")));
              }
            }
          });

          const promiseResult = await promise;
          // Using granular add for single account
          await addAccountMutation(promiseResult);
        })(),
        {
          loading: t("account.deviceCodeImportToast.loading"),
          success: t("account.deviceCodeImportToast.success"),
          error: (e) => {
            console.error(e);
            setDeviceCodeData(null);
            return t("account.deviceCodeImportToast.error");
          },
          cancel: {
            label: t("common:cancel"),
            onClick: () => {
              setDeviceCodeData(null);
              abortController.abort();
            },
          },
        },
      );
    },
    [instanceInfo.id, addAccountMutation, t, transport],
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <PlusIcon />
          {t("account.addAccounts")}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("account.import.javaEdition")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_java_offline");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.OFFLINE,
                );
              }}
            >
              {t("account.import.offline")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_java_credentials");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS,
                );
              }}
            >
              {t("account.import.microsoftCredentials")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_java_device_code");
                setPendingDeviceCodeType(
                  AccountTypeDeviceCode.MICROSOFT_JAVA_DEVICE_CODE,
                );
              }}
            >
              {t("account.import.microsoftDeviceCode")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_java_refresh_token");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.MICROSOFT_JAVA_REFRESH_TOKEN,
                );
              }}
            >
              {t("account.import.microsoftRefreshToken")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_java_cookies");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
                );
              }}
            >
              {t("account.import.microsoftCookies")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_java_access_token");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
                );
              }}
            >
              {t("account.import.microsoftAccessToken")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("account.import.altProviders")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_ravealts");
                setRavealtsDialogOpen(true);
              }}
            >
              {t("account.ravealts.button")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_the_altening");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.THE_ALTENING,
                );
              }}
            >
              {t("account.import.theAltening")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("account.import.bedrockEdition")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_bedrock_offline");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.OFFLINE,
                );
              }}
            >
              {t("account.import.offline")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_bedrock_credentials");
                setAccountTypeCredentialsSelected(
                  AccountTypeCredentials.MICROSOFT_BEDROCK_CREDENTIALS,
                );
              }}
            >
              {t("account.import.microsoftCredentials")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_account_microsoft_bedrock_device_code");
                setPendingDeviceCodeType(
                  AccountTypeDeviceCode.MICROSOFT_BEDROCK_DEVICE_CODE,
                );
              }}
            >
              {t("account.import.microsoftDeviceCode")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {deviceCodeData !== null && (
        <DeviceCodeDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeviceCodeData(null);
          }}
          deviceCodeData={deviceCodeData}
        />
      )}
      {pendingDeviceCodeType !== null && (
        <Credenza
          open={true}
          onOpenChange={(open) => {
            if (!open) setPendingDeviceCodeType(null);
          }}
        >
          <CredenzaContent>
            <CredenzaHeader>
              <CredenzaTitle>
                {t("account.deviceCodeConfirmDialog.title")}
              </CredenzaTitle>
              <CredenzaDescription>
                {t("account.deviceCodeConfirmDialog.description")}
              </CredenzaDescription>
            </CredenzaHeader>
            <CredenzaBody>
              <InstanceSettingFieldByKey
                namespace="account"
                settingKey="use-proxies-for-account-auth"
                invalidateQuery={async () => {
                  await queryClient.invalidateQueries({
                    queryKey: instanceInfoQueryOptions.queryKey,
                  });
                }}
                updateConfigEntry={async (namespace, key, value) => {
                  await updateInstanceConfigEntry(
                    namespace,
                    key,
                    value,
                    instanceInfo,
                    transport,
                    queryClient,
                    instanceInfoQueryOptions.queryKey,
                  );
                }}
                config={profile}
              />
            </CredenzaBody>
            <CredenzaFooter>
              <Button
                onClick={() => {
                  const type = pendingDeviceCodeType;
                  setPendingDeviceCodeType(null);
                  deviceCodeSelected(type);
                }}
              >
                {t("account.deviceCodeConfirmDialog.start")}
              </Button>
            </CredenzaFooter>
          </CredenzaContent>
        </Credenza>
      )}
      {accountTypeCredentialsSelected !== null && (
        <ImportDialog
          title={t("account.import.dialog.title", {
            type: getEnumKeyByValue(
              AccountTypeCredentials,
              accountTypeCredentialsSelected,
            ),
          })}
          description={t("account.import.dialog.description")}
          closer={() => setAccountTypeCredentialsSelected(null)}
          listener={textSelectedCallback}
          filters={[
            {
              name: "Text File",
              mimeType: "text/plain",
              extensions: ["txt"],
            },
          ]}
          allowMultiple={true}
          textInput={{
            defaultValue: "",
          }}
          extraContent={
            <div className="flex flex-col gap-4">
              <InstanceSettingFieldByKey
                namespace="account"
                settingKey="use-proxies-for-account-auth"
                invalidateQuery={async () => {
                  await queryClient.invalidateQueries({
                    queryKey: instanceInfoQueryOptions.queryKey,
                  });
                }}
                updateConfigEntry={async (namespace, key, value) => {
                  await updateInstanceConfigEntry(
                    namespace,
                    key,
                    value,
                    instanceInfo,
                    transport,
                    queryClient,
                    instanceInfoQueryOptions.queryKey,
                  );
                }}
                config={profile}
              />
              <InstanceSettingFieldByKey
                namespace="account"
                settingKey="account-import-concurrency"
                invalidateQuery={async () => {
                  await queryClient.invalidateQueries({
                    queryKey: instanceInfoQueryOptions.queryKey,
                  });
                }}
                updateConfigEntry={async (namespace, key, value) => {
                  await updateInstanceConfigEntry(
                    namespace,
                    key,
                    value,
                    instanceInfo,
                    transport,
                    queryClient,
                    instanceInfoQueryOptions.queryKey,
                  );
                }}
                config={profile}
              />
            </div>
          }
        />
      )}
      <RavealtsDialog
        open={ravealtsDialogOpen}
        onOpenChange={setRavealtsDialogOpen}
        onImportAccounts={handleRavealtsImport}
      />
    </>
  );
}

function ExtraHeader(props: {
  table: ReactTable<typeof dataTableFeatures, ProfileAccount>;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { trackEvent } = useAptabase();
  // Batch remove accounts mutation
  const { mutateAsync: removeAccountsBatchMutation } = useMutation({
    mutationKey: ["instance", "accounts", "remove-batch", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
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

  return (
    <>
      <DataTableActionBarAction
        tooltip={t("account.removeSelectedTooltip")}
        onClick={() => {
          void trackEvent("remove_accounts", {
            count: props.table.getFilteredSelectedRowModel().rows.length,
          });
          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          toast.promise(
            removeAccountsBatchMutation(selectedRows.map((r) => r.profileId)),
            {
              loading: t("account.removeToast.loading"),
              success: t("account.removeToast.success", {
                count: selectedRows.length,
              }),
              error: (e) => {
                console.error(e);
                return t("account.removeToast.error");
              },
            },
          );
        }}
      >
        <TrashIcon />
      </DataTableActionBarAction>
      <DataTableActionBarSelection table={props.table} />
    </>
  );
}

function AccountSettingsSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <DataTableSkeleton
        columnCount={5}
        filterCount={3}
        cellWidths={["2rem", "8rem", "auto", "auto", "5rem"]}
      />
    </div>
  );
}

function AccountSettings() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "settings",
          content: t("breadcrumbs.settings"),
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
  const [configAccount, setConfigAccount] = useState<ProfileAccount | null>(
    null,
  );
  const [metadataAccount, setMetadataAccount] = useState<ProfileAccount | null>(
    null,
  );

  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <InstanceSettingsPageComponent
          data={
            instanceInfo.instanceSettings.find(
              (s) => s.id === "account",
            ) as SettingsPage
          }
          disabledIds={ACCOUNT_SETTINGS_DISABLED_IDS}
        />
      </div>
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
          <GetAccountsButton />
          <GenerateAccountsButton />
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
              setConfigAccount(contextMenu.data);
              dismiss();
            }}
          >
            <SettingsIcon />
            {t("account.contextMenu.openConfig")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMetadataAccount(contextMenu.data);
              dismiss();
            }}
          >
            <BracesIcon />
            {t("account.contextMenu.openMetadata")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("account.contextMenu.copyProfileId")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.lastKnownName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("account.contextMenu.copyUsername")}
          </MenuItem>
        </ContextMenuPortal>
      )}
      {configAccount && (
        <AccountConfigDialog
          account={configAccount}
          open={true}
          onOpenChange={(open) => {
            if (!open) setConfigAccount(null);
          }}
        />
      )}
      {metadataAccount && (
        <AccountMetadataDialog
          account={metadataAccount}
          open={true}
          onOpenChange={(open) => {
            if (!open) setMetadataAccount(null);
          }}
        />
      )}
    </div>
  );
}

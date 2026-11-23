import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useRouteContext,
} from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  PlusIcon,
  ShoppingCartIcon,
  SparklesIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { use, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
import AccountProvidersDialog from "@/components/dialog/account-providers-dialog.tsx";
import { DeviceCodeDialog } from "@/components/dialog/device-code-dialog.tsx";
import GenerateAccountsDialog from "@/components/dialog/generate-accounts-dialog.tsx";
import ImportDialog from "@/components/dialog/import-dialog.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { InstanceSettingFieldByKey } from "@/components/settings-page.tsx";
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
import {
  AccountTypeCredentials,
  AccountTypeDeviceCode,
} from "@/generated/soulfire/common_pb";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useCredentialLoginStream } from "@/hooks/use-credential-login-stream.ts";
import { useDeviceCodeLogin } from "@/hooks/use-device-code-login.ts";
import { splitAccountCredentialPayloads } from "@/lib/account-credential-payloads.ts";
import { keepExistingAccountState } from "@/lib/account-list.ts";
import { getConnectionErrorKind } from "@/lib/connection-errors.ts";
import { isPostHogConfigured } from "@/lib/posthog.ts";
import { ACCOUNT_PROVIDERS } from "@/lib/resource-providers.ts";
import {
  type GenerateAccountsMode,
  getEnumKeyByValue,
  type InstanceInfoQueryData,
  type ProfileAccount,
} from "@/lib/types.ts";
import {
  addInstanceAccountsBatch,
  applyGeneratedAccounts,
  updateInstanceConfigEntry,
} from "@/lib/utils.tsx";

const CREDENTIAL_FORMAT_KEYS = {
  [AccountTypeCredentials.OFFLINE]: "offline",
  [AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS]: "microsoftCredentials",
  [AccountTypeCredentials.MICROSOFT_BEDROCK_CREDENTIALS]:
    "microsoftCredentials",
  [AccountTypeCredentials.MICROSOFT_JAVA_REFRESH_TOKEN]: "refreshToken",
  [AccountTypeCredentials.MICROSOFT_JAVA_COOKIES]: "cookies",
  [AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN]: "accessToken",
  [AccountTypeCredentials.THE_ALTENING]: "theAltening",
} as const satisfies Record<AccountTypeCredentials, string>;

function credentialFormatKey(type: AccountTypeCredentials) {
  return `account.import.format.${CREDENTIAL_FORMAT_KEYS[type]}` as const;
}

type ImportOption =
  | { kind: "credentials"; type: AccountTypeCredentials }
  | { kind: "deviceCode"; type: AccountTypeDeviceCode };

interface ImportGroup {
  label: string;
  options: readonly { id: string; label: string; option: ImportOption }[];
}

const JAVA_IMPORTS = {
  label: "account.import.javaEdition",
  options: [
    {
      id: "java-offline",
      label: "account.import.offline",
      option: { kind: "credentials", type: AccountTypeCredentials.OFFLINE },
    },
    {
      id: "java-credentials",
      label: "account.import.microsoftCredentials",
      option: {
        kind: "credentials",
        type: AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS,
      },
    },
    {
      id: "java-device-code",
      label: "account.import.microsoftDeviceCode",
      option: {
        kind: "deviceCode",
        type: AccountTypeDeviceCode.MICROSOFT_JAVA_DEVICE_CODE,
      },
    },
    {
      id: "java-refresh-token",
      label: "account.import.microsoftRefreshToken",
      option: {
        kind: "credentials",
        type: AccountTypeCredentials.MICROSOFT_JAVA_REFRESH_TOKEN,
      },
    },
    {
      id: "java-cookies",
      label: "account.import.microsoftCookies",
      option: {
        kind: "credentials",
        type: AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
      },
    },
    {
      id: "java-access-token",
      label: "account.import.microsoftAccessToken",
      option: {
        kind: "credentials",
        type: AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
      },
    },
  ],
} as const satisfies ImportGroup;

const BEDROCK_IMPORTS = {
  label: "account.import.bedrockEdition",
  options: [
    {
      id: "bedrock-offline",
      label: "account.import.offline",
      option: { kind: "credentials", type: AccountTypeCredentials.OFFLINE },
    },
    {
      id: "bedrock-credentials",
      label: "account.import.microsoftCredentials",
      option: {
        kind: "credentials",
        type: AccountTypeCredentials.MICROSOFT_BEDROCK_CREDENTIALS,
      },
    },
    {
      id: "bedrock-device-code",
      label: "account.import.microsoftDeviceCode",
      option: {
        kind: "deviceCode",
        type: AccountTypeDeviceCode.MICROSOFT_BEDROCK_DEVICE_CODE,
      },
    },
  ],
} as const satisfies ImportGroup;

// Providers with an import flow open in the provider dialog.
const IMPORT_PROVIDERS = ACCOUNT_PROVIDERS.filter((provider) =>
  provider.capabilities.includes("import"),
);

/** Toast options that point users who just added accounts to the bot controls. */
function useStartBotsToastAction(instanceId: string): ExternalToast {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  return useMemo(
    () => ({
      duration: 10_000,
      action: {
        label: t("controls.startBots"),
        onClick: () => {
          void navigate({
            to: "/instance/$instance",
            params: { instance: instanceId },
          });
        },
      },
    }),
    [instanceId, navigate, t],
  );
}

function useInstanceInfo() {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  return { instanceInfo, queryKey: instanceInfoQueryOptions.queryKey };
}

/** Saved accounts at call time, so a slow sign-in does not use stale data. */
function useCurrentAccounts() {
  const queryClient = useQueryClient();
  const { queryKey } = useInstanceInfo();
  return useCallback(
    () =>
      queryClient.getQueryData<InstanceInfoQueryData>(queryKey)?.profile
        .accounts ?? [],
    [queryClient, queryKey],
  );
}

/** One account import setting, saved to the project config. */
function AccountSettingField({ settingKey }: { settingKey: string }) {
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { instanceInfo, queryKey } = useInstanceInfo();
  return (
    <InstanceSettingFieldByKey
      namespace="account"
      settingKey={settingKey}
      invalidateQuery={async () => {
        await queryClient.invalidateQueries({ queryKey });
      }}
      updateConfigEntry={async (namespace, key, value) => {
        await updateInstanceConfigEntry(
          namespace,
          key,
          value,
          instanceInfo,
          transport,
          queryClient,
          queryKey,
        );
      }}
      config={instanceInfo.profile}
    />
  );
}

function GenerateAccountsButton({
  successToast,
}: {
  successToast: ExternalToast;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { instanceInfo, queryKey } = useInstanceInfo();
  const currentAccounts = useCurrentAccounts();
  const posthog = usePostHog();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { mutateAsync: generate } = useMutation({
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
        mode === "REPLACE_ALL"
          ? newAccounts
          : keepExistingAccountState(currentAccounts(), newAccounts),
        mode,
        instanceInfo,
        transport,
        queryClient,
        queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const existingUsernames = useMemo(
    () => new Set(instanceInfo.profile.accounts.map((a) => a.lastKnownName)),
    [instanceInfo.profile.accounts],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDialogOpen(true);
        }}
      >
        <SparklesIcon />
        {t("account.generateAccounts")}
      </Button>
      <GenerateAccountsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGenerate={async (newAccounts, mode) => {
          await generate({ newAccounts, mode });
          if (isPostHogConfigured) {
            posthog.capture("accounts_generated", {
              account_count: newAccounts.length,
              generation_mode: mode,
            });
          }
        }}
        existingUsernames={existingUsernames}
        successToast={successToast}
      />
    </>
  );
}

/** Toolbar buttons that get, generate, and import accounts. */
export function AddAccountsMenu({
  guide,
}: {
  guide: "setup" | "providers" | null | undefined;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { instanceInfo, queryKey } = useInstanceInfo();
  const instanceId = useParams({
    from: "/_dashboard/instance/$instance",
    select: (params) => params.instance,
  });
  const currentAccounts = useCurrentAccounts();
  const startBotsToastAction = useStartBotsToastAction(instanceId);
  const copyCredentials = useCopyToClipboard({ sensitive: true });

  const { mutateAsync: saveAccounts } = useMutation({
    mutationKey: ["instance", "accounts", "add-batch", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
    mutationFn: async (accounts: ProfileAccount[]) => {
      await addInstanceAccountsBatch(
        keepExistingAccountState(currentAccounts(), accounts),
        instanceInfo,
        transport,
        queryClient,
        queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const [credentialType, setCredentialType] =
    useState<AccountTypeCredentials | null>(null);
  const [pendingDeviceCodeType, setPendingDeviceCodeType] =
    useState<AccountTypeDeviceCode | null>(null);
  const [providerDialogOpen, setProviderDialogOpen] = useState(
    guide === "providers",
  );
  const [initialProviderId, setInitialProviderId] = useState<
    string | undefined
  >();
  const openProviderDialog = (providerId?: string) => {
    setInitialProviderId(providerId);
    setProviderDialogOpen(true);
  };

  const deviceCodeLogin = useDeviceCodeLogin({
    instanceId: instanceInfo.id,
    saveAccount: async (account) => {
      await saveAccounts([account]);
    },
    successToast: startBotsToastAction,
  });

  const startCredentialLogin = useCredentialLoginStream();
  const importCredentials = useCallback(
    (payload: string[], type: AccountTypeCredentials) => {
      const formatHint = t(credentialFormatKey(type));
      // The server does not say which payload failed, so offer all of them.
      // Purchased credentials cannot be delivered again.
      const keepCredentials: ExternalToast = {
        duration: Infinity,
        closeButton: true,
        action: {
          label: t("account.listImportToast.copyCredentials"),
          onClick: (event) => {
            event.preventDefault();
            void copyCredentials(
              payload.join(
                type === AccountTypeCredentials.MICROSOFT_JAVA_COOKIES
                  ? "\n\n"
                  : "\n",
              ),
            );
          },
        },
      };
      const handle = startCredentialLogin({
        instanceId: instanceInfo.id,
        service: type,
        payload,
        progressMessage: (progress) =>
          t("account.listImportToast.loading", { ...progress }),
        onSettled: async ({ outcome, accounts, failed, error }, toastId) => {
          const base = { id: toastId, cancel: undefined };
          // Accounts that signed in are already authenticated. Save them for
          // every outcome, since purchased credentials may not work again.
          if (accounts.length > 0) {
            try {
              await saveAccounts(accounts);
            } catch (saveError) {
              console.error(saveError);
              toast.error(t("account.listImportToast.error"), {
                ...base,
                ...keepCredentials,
                description: t(
                  `account.listImportToast.errorReason.${getConnectionErrorKind(saveError)}`,
                ),
              });
              return;
            }
          }

          const finished =
            outcome === "complete" && failed === 0
              ? { ...base, ...startBotsToastAction }
              : { ...base, ...keepCredentials };
          if (outcome === "cancelled") {
            if (accounts.length > 0) {
              toast.success(
                t("account.listImportToast.cancelledSaved", {
                  count: accounts.length,
                }),
                finished,
              );
            } else {
              toast.info(t("account.listImportToast.cancelled"), finished);
            }
          } else if (outcome === "error") {
            console.error(error);
            const description = t(
              `account.listImportToast.errorReason.${getConnectionErrorKind(error)}`,
            );
            if (accounts.length > 0) {
              toast.warning(
                t("account.listImportToast.errorSaved", {
                  count: accounts.length,
                }),
                { ...finished, description },
              );
            } else {
              toast.error(t("account.listImportToast.error"), {
                ...finished,
                description,
              });
            }
          } else if (accounts.length === 0) {
            toast.error(t("account.listImportToast.allFailed"), {
              ...finished,
              description: formatHint,
            });
          } else if (failed > 0) {
            toast.warning(
              t("account.listImportToast.someFailed", {
                count: accounts.length,
                failed,
              }),
              { ...finished, description: formatHint },
            );
          } else {
            toast.success(
              t("account.listImportToast.noneFailed", {
                count: accounts.length,
              }),
              finished,
            );
          }
        },
      });
      if (handle === null) {
        toast.info(t("account.import.demo"));
      }
    },
    [
      instanceInfo.id,
      saveAccounts,
      t,
      startCredentialLogin,
      startBotsToastAction,
      copyCredentials,
    ],
  );

  const importText = (text: string) => {
    if (credentialType === null) return;
    const payload = splitAccountCredentialPayloads(text, credentialType);
    if (payload.length === 0) {
      toast.error(t("account.listImportToast.noAccounts"), {
        description: t(credentialFormatKey(credentialType)),
      });
      return;
    }
    setCredentialType(null);
    importCredentials(payload, credentialType);
  };

  const selectOption = (option: ImportOption) => {
    if (option.kind === "credentials") setCredentialType(option.type);
    else setPendingDeviceCodeType(option.type);
  };
  const renderImportGroup = (
    group: typeof JAVA_IMPORTS | typeof BEDROCK_IMPORTS,
  ) => (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{t(group.label)}</DropdownMenuLabel>
      {group.options.map((entry) => (
        <DropdownMenuItem
          key={entry.id}
          onClick={() => {
            selectOption(entry.option);
          }}
        >
          {t(entry.label)}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );

  return (
    <>
      {guide && (
        <Button
          variant="secondary"
          size="sm"
          nativeButton={false}
          render={
            <Link to="/instance/$instance" params={{ instance: instanceId }} />
          }
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("setup.backToSetup")}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          openProviderDialog();
        }}
      >
        <ShoppingCartIcon />
        {t("account.getAccounts")}
      </Button>
      <GenerateAccountsButton successToast={startBotsToastAction} />
      <AccountProvidersDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        initialProviderId={initialProviderId}
        onImport={importCredentials}
        canPurchase={transport !== null}
      />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <PlusIcon />
          {t("account.addAccounts")}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          {renderImportGroup(JAVA_IMPORTS)}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("account.import.altProviders")}
            </DropdownMenuLabel>
            {IMPORT_PROVIDERS.map((provider) => (
              <DropdownMenuItem
                key={provider.id}
                onClick={() => {
                  openProviderDialog(provider.id);
                }}
              >
                {provider.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() => {
                setCredentialType(AccountTypeCredentials.THE_ALTENING);
              }}
            >
              {t("account.import.theAltening")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {renderImportGroup(BEDROCK_IMPORTS)}
        </DropdownMenuContent>
      </DropdownMenu>
      {deviceCodeLogin.code !== null && (
        <DeviceCodeDialog
          open
          onOpenChange={(open) => {
            if (!open) deviceCodeLogin.cancel();
          }}
          deviceCodeData={deviceCodeLogin.code}
        />
      )}
      {pendingDeviceCodeType !== null && (
        <Credenza
          open
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
              <AccountSettingField settingKey="use-proxies-for-account-auth" />
            </CredenzaBody>
            <CredenzaFooter>
              <Button
                onClick={() => {
                  const type = pendingDeviceCodeType;
                  setPendingDeviceCodeType(null);
                  deviceCodeLogin.start(type);
                }}
              >
                {t("account.deviceCodeConfirmDialog.start")}
              </Button>
            </CredenzaFooter>
          </CredenzaContent>
        </Credenza>
      )}
      {credentialType !== null && (
        <ImportDialog
          title={t("account.import.dialog.title", {
            type: getEnumKeyByValue(AccountTypeCredentials, credentialType),
          })}
          description={t(credentialFormatKey(credentialType))}
          closer={() => {
            setCredentialType(null);
          }}
          listener={importText}
          filters={[
            {
              name: t("common:textFile"),
              mimeType: "text/plain",
              extensions: ["txt"],
            },
          ]}
          allowMultiple
          textInput={{ defaultValue: "" }}
          extraContent={
            <div className="flex flex-col gap-4">
              <AccountSettingField settingKey="use-proxies-for-account-auth" />
              <AccountSettingField settingKey="account-import-concurrency" />
            </div>
          }
        />
      )}
    </>
  );
}

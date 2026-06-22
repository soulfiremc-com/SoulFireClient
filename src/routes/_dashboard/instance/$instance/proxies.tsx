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
import { saveAs } from "file-saver";
import {
  ClipboardCopyIcon,
  Dice4Icon,
  Dice5Icon,
  DownloadIcon,
  GlobeIcon,
  PlusIcon,
  ShoppingCartIcon,
  TextIcon,
  TrashIcon,
  Wand2Icon,
} from "lucide-react";
import { use, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
import URI from "urijs";
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
import ImportDialog from "@/components/dialog/import-dialog.tsx";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import type { SettingsPage } from "@/generated/soulfire/common_pb";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb.ts";
import { ProxyCheckService } from "@/generated/soulfire/proxy-check_pb.ts";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDataTable } from "@/hooks/use-data-table.ts";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import i18n from "@/lib/i18n.ts";
import { dataTableValidateSearch } from "@/lib/parsers.ts";
import { observeServerStream } from "@/lib/protobuf.ts";
import { routeChrome } from "@/lib/route-title.ts";
import {
  getEnumEntries,
  getEnumKeyByValue,
  type InstanceInfoQueryData,
  mapUnionToValue,
  type ProfileProxy,
} from "@/lib/types.ts";
import {
  addInstanceProxiesBatch,
  data2blob,
  removeInstanceProxiesBatch,
  runAsync,
  updateInstanceConfigEntry,
} from "@/lib/utils.tsx";

const PROXY_SETTINGS_DISABLED_IDS: DisabledSettingId[] = [
  { namespace: "proxy", key: "proxy-check-concurrency" },
  { namespace: "proxy", key: "proxy-check-address" },
  { namespace: "proxy", key: "proxy-check-timeout" },
];

const PROXY_CHECK_SETTING_KEYS = [
  "proxy-check-address",
  "proxy-check-concurrency",
  "proxy-check-timeout",
] as const;

function ProxyCheckDialog({
  open,
  onOpenChange,
  onConfirm,
  count,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  count: number;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const transport = use(TransportContext);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("proxy.checkDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("proxy.checkDialog.description", { count })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {PROXY_CHECK_SETTING_KEYS.map((key) => (
            <InstanceSettingFieldByKey
              key={key}
              namespace="proxy"
              settingKey={key}
              invalidateQuery={async () => {
                await queryClient.invalidateQueries({
                  queryKey: instanceInfoQueryOptions.queryKey,
                });
              }}
              updateConfigEntry={async (namespace, settingKey, value) => {
                await updateInstanceConfigEntry(
                  namespace,
                  settingKey,
                  value,
                  instanceInfo,
                  transport,
                  queryClient,
                  instanceInfoQueryOptions.queryKey,
                );
              }}
              config={profile}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button onClick={onConfirm}>{t("proxy.checkDialog.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_dashboard/instance/$instance/proxies")({
  validateSearch: dataTableValidateSearch,
  beforeLoad: () =>
    routeChrome({
      getTitle: () => i18n.t("common:pageName.proxySettings"),
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
        const proxyPage = instanceInfo?.instanceSettings.find(
          (page) => page.id === "proxy",
        );

        return {
          kind: "dynamic",
          name: proxyPage?.iconId ?? "waypoints",
        };
      },
    }),
  component: ProxySettings,
});

enum UIProxyType {
  HTTP,
  SOCKS4,
  SOCKS5,
  URI,
}

type SimpleProxyType =
  | UIProxyType.HTTP
  | UIProxyType.SOCKS4
  | UIProxyType.SOCKS5;

function uiProxyTypeToProto(type: SimpleProxyType): ProxyProto_Type {
  switch (type) {
    case UIProxyType.HTTP:
      return ProxyProto_Type.HTTP;
    case UIProxyType.SOCKS4:
      return ProxyProto_Type.SOCKS4;
    case UIProxyType.SOCKS5:
      return ProxyProto_Type.SOCKS5;
  }
}

function parseNormalProxy(line: string, type: SimpleProxyType): ProfileProxy {
  // Support user:pass@host:port format
  const atIndex = line.lastIndexOf("@");
  if (atIndex !== -1) {
    const userInfo = line.substring(0, atIndex);
    const hostPort = line.substring(atIndex + 1);
    const hostPortParts = hostPort.split(":");
    if (hostPortParts.length < 2) {
      throw new Error(i18n.t("instance:proxy.invalidFormat"));
    }

    const host = `${hostPortParts[0]}:${hostPortParts[1]}`;
    const userInfoParts = userInfo.split(":");
    return {
      type: uiProxyTypeToProto(type),
      address: host.startsWith("/") ? `unix://${host}` : `inet://${host}`,
      username: userInfoParts[0],
      password: userInfoParts[1],
    };
  }

  // Standard host:port:user:pass format
  const parts = line.split(":");
  if (parts.length < 2) {
    throw new Error(i18n.t("instance:proxy.invalidFormat"));
  }

  // Fill username and password with undefined if not present
  parts.length = 4;

  const host = `${parts[0]}:${parts[1]}`;
  return {
    type: uiProxyTypeToProto(type),
    address: host.startsWith("/") ? `unix://${host}` : `inet://${host}`,
    username: parts[2],
    password: parts[3],
  };
}

function parseRawTypeToProto(rawType: string): ProxyProto_Type | null {
  switch (rawType) {
    case "http":
      return ProxyProto_Type.HTTP;
    case "socks4":
      return ProxyProto_Type.SOCKS4;
    case "socks5":
      return ProxyProto_Type.SOCKS5;
    default:
      return null;
  }
}

function parseURIProxy(line: string): ProfileProxy | null {
  const uri = new URI(line);
  const host = uri.host();
  const type = parseRawTypeToProto(uri.protocol());
  if (type === null) {
    return null;
  }

  return {
    type,
    address: host.startsWith("/") ? `unix://${host}` : `inet://${host}`,
    username: uri.username() === "" ? undefined : uri.username(),
    password: uri.password() === "" ? undefined : uri.password(),
  };
}

function getProxyKey(proxy: ProfileProxy): string {
  return `${proxy.type}-${proxy.address}-${proxy.username ?? ""}-${
    proxy.password ?? ""
  }`;
}

function stripAddressPrefix(address: string): string {
  if (address.startsWith("inet://")) {
    return address.slice(7);
  }
  if (address.startsWith("unix://")) {
    return address.slice(7);
  }
  return address;
}

function formatProxyAsURI(proxy: ProfileProxy): string {
  const address = stripAddressPrefix(proxy.address);
  const protocol = getEnumKeyByValue(ProxyProto_Type, proxy.type)
    .toString()
    .toLowerCase();

  if (proxy.username && proxy.password) {
    return `${protocol}://${proxy.username}:${proxy.password}@${address}`;
  }
  if (proxy.username) {
    return `${protocol}://${proxy.username}@${address}`;
  }
  return `${protocol}://${address}`;
}

function formatProxyAsFlat(proxy: ProfileProxy): string {
  const address = stripAddressPrefix(proxy.address);

  if (proxy.username && proxy.password) {
    return `${address}:${proxy.username}:${proxy.password}`;
  }
  if (proxy.username) {
    return `${address}:${proxy.username}`;
  }
  return address;
}

function saveProxyFile(content: string, filename: string) {
  if (isDesktopApp()) {
    runAsync(async () => {
      let selected = await desktop.dialog.save({
        title: filename,
        filters: [
          {
            name: "Text File",
            extensions: ["txt"],
          },
        ],
      });

      if (selected) {
        if (!selected.endsWith(".txt")) {
          selected += ".txt";
        }
        await desktop.fs.writeTextFile(selected, content);
      }
    });
  } else {
    saveAs(data2blob(content), filename);
  }
}

const proxyTypeToIcon = (type: keyof typeof ProxyProto_Type) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "HTTP":
        return GlobeIcon;
      case "SOCKS4":
        return Dice4Icon;
      case "SOCKS5":
        return Dice5Icon;
    }
  });

const columns: ColumnDef<typeof dataTableFeatures, ProfileProxy>[] = [
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
    accessorFn: (row) => getEnumKeyByValue(ProxyProto_Type, row.type),
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:proxy.table.type")}
      />
    ),
    cell: ({ cell }) => {
      const type = cell.getValue<keyof typeof ProxyProto_Type>();
      const Icon = proxyTypeToIcon(type);

      return (
        <Badge variant="outline" className="capitalize">
          <Icon />
          {type}
        </Badge>
      );
    },
    meta: {
      get label() {
        return i18n.t("instance:proxy.table.type");
      },
      variant: "multiSelect",
      options: getEnumEntries(ProxyProto_Type).map((type) => {
        return {
          label: type.key,
          value: type.key,
          icon: proxyTypeToIcon(type.key),
        };
      }),
    },
    enableColumnFilter: true,
  },
  {
    id: "address",
    accessorKey: "address",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:proxy.table.address")}
      />
    ),
    meta: {
      get label() {
        return i18n.t("instance:proxy.table.address");
      },
      get placeholder() {
        return i18n.t("instance:proxy.table.searchAddresses");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "username",
    accessorKey: "username",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:proxy.table.username")}
      />
    ),
    meta: {
      get label() {
        return i18n.t("instance:proxy.table.username");
      },
      get placeholder() {
        return i18n.t("instance:proxy.table.searchUsernames");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "password",
    accessorKey: "password",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        label={i18n.t("instance:proxy.table.password")}
      />
    ),
    meta: {
      get label() {
        return i18n.t("instance:proxy.table.password");
      },
      get placeholder() {
        return i18n.t("instance:proxy.table.searchPasswords");
      },
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
];

function GetProxiesButton() {
  const { t } = useTranslation("instance");

  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={
        <ExternalLink href="https://soulfiremc.com/get-proxies?utm_source=soulfire-client&utm_medium=app&utm_campaign=proxies-get" />
      }
    >
      <ShoppingCartIcon />
      {t("proxy.getProxies")}
    </Button>
  );
}

function AddButton() {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const [proxyTypeSelected, setProxyTypeSelected] =
    useState<UIProxyType | null>(null);
  const { trackEvent } = useAptabase();
  const [importedProxies, setImportedProxies] = useState<ProfileProxy[] | null>(
    null,
  );
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  // Batch add proxies mutation
  const { mutateAsync: addProxiesBatchMutation } = useMutation({
    mutationKey: ["instance", "proxies", "add-batch", instanceInfo.id],
    scope: { id: `instance-proxies-${instanceInfo.id}` },
    mutationFn: async (proxies: ProfileProxy[]) => {
      await addInstanceProxiesBatch(
        proxies,
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
  // Batch remove proxies mutation (for post-import check)
  const { mutateAsync: removeProxiesBatchMutation } = useMutation({
    mutationKey: ["instance", "proxies", "remove-batch", instanceInfo.id],
    scope: { id: `instance-proxies-${instanceInfo.id}` },
    mutationFn: async (addresses: string[]) => {
      await removeInstanceProxiesBatch(
        addresses,
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

  const textSelectedCallback = useCallback(
    (text: string) => {
      if (proxyTypeSelected === null) return;

      if (text.length === 0) {
        toast.error(t("proxy.listImportToast.noProxies"));
        return;
      }

      setProxyTypeSelected(null);
      const textSplit = text
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      toast.promise(
        (async () => {
          const proxiesToAdd: ProfileProxy[] = [];
          for (const line of textSplit) {
            let proxy: ProfileProxy | null;
            switch (proxyTypeSelected) {
              case UIProxyType.HTTP:
              case UIProxyType.SOCKS4:
              case UIProxyType.SOCKS5:
                proxy = parseNormalProxy(line, proxyTypeSelected);
                break;
              case UIProxyType.URI:
                proxy = parseURIProxy(line);
                break;
            }

            if (proxy === null) {
              continue;
            }

            proxiesToAdd.push(proxy);
          }

          await addProxiesBatchMutation(proxiesToAdd);
          if (proxiesToAdd.length > 0) {
            setImportedProxies(proxiesToAdd);
          }
          return proxiesToAdd.length;
        })(),
        {
          loading: t("proxy.listImportToast.loading"),
          success: (r) => t("proxy.listImportToast.success", { count: r }),
          error: (e) => {
            console.error(e);
            return t("proxy.listImportToast.error");
          },
        },
      );
    },
    [proxyTypeSelected, addProxiesBatchMutation, t],
  );

  const performProxyCheck = useCallback(() => {
    if (transport === null || importedProxies === null) {
      return;
    }

    const proxiesToCheck = importedProxies;
    setImportedProxies(null);

    void trackEvent("check_proxies", {
      count: proxiesToCheck.length,
    });

    const abortController = new AbortController();
    const loadingData: ExternalToast = {
      cancel: {
        label: t("common:cancel"),
        onClick: () => {
          abortController.abort();
        },
      },
    };
    const total = proxiesToCheck.length;
    let failed = 0;
    let success = 0;
    const loadingReport = () =>
      t("proxy.checkToast.loading", {
        checked: success + failed,
        total,
        success,
        failed,
      });
    const toastId = toast.loading(loadingReport(), loadingData);
    const service = createClient(ProxyCheckService, transport);
    const responses = service.check(
      {
        instanceId: instanceInfo.id,
        proxy: proxiesToCheck,
      },
      {
        signal: abortController.signal,
      },
    );
    void observeServerStream(responses, {
      onMessage: async (r) => {
        const data = r.data;
        switch (data.case) {
          case "end": {
            toast.success(
              t("proxy.checkToast.success", {
                count: failed,
              }),
              {
                id: toastId,
                cancel: undefined,
              },
            );
            break;
          }
          case "single": {
            if (abortController.signal.aborted) {
              return;
            }

            if (data.value.valid) {
              success++;
            } else {
              failed++;
              const proxyToRemove = data.value.proxy;
              if (proxyToRemove) {
                await removeProxiesBatchMutation([proxyToRemove.address]);
              }
            }

            toast.loading(loadingReport(), {
              id: toastId,
              ...loadingData,
            });
            break;
          }
        }
      },
      onError: (e) => {
        console.error(e);
        toast.error(t("proxy.checkToast.error"), {
          id: toastId,
          cancel: undefined,
        });
      },
    });
  }, [
    transport,
    importedProxies,
    trackEvent,
    t,
    instanceInfo.id,
    removeProxiesBatchMutation,
  ]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <PlusIcon />
          {t("proxy.addProxies")}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("proxy.import.proxyType")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_proxies_http");
                setProxyTypeSelected(UIProxyType.HTTP);
              }}
            >
              {t("proxy.import.http")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_proxies_socks4");
                setProxyTypeSelected(UIProxyType.SOCKS4);
              }}
            >
              {t("proxy.import.socks4")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_proxies_socks5");
                setProxyTypeSelected(UIProxyType.SOCKS5);
              }}
            >
              {t("proxy.import.socks5")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void trackEvent("import_proxies_uri");
                setProxyTypeSelected(UIProxyType.URI);
              }}
            >
              {t("proxy.import.uri")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {proxyTypeSelected !== null && (
        <ImportDialog
          title={t("proxy.import.dialog.title", {
            type: getEnumKeyByValue(UIProxyType, proxyTypeSelected),
          })}
          description={t("proxy.import.dialog.description")}
          closer={() => setProxyTypeSelected(null)}
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
        />
      )}
      <Dialog
        open={importedProxies !== null && !checkDialogOpen}
        onOpenChange={(open) => {
          if (!open) setImportedProxies(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("proxy.postImportCheckDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("proxy.postImportCheckDialog.description", {
                count: importedProxies?.length ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportedProxies(null)}>
              {t("proxy.postImportCheckDialog.skip")}
            </Button>
            <Button onClick={() => setCheckDialogOpen(true)}>
              {t("proxy.postImportCheckDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProxyCheckDialog
        open={checkDialogOpen}
        onOpenChange={(open) => {
          setCheckDialogOpen(open);
          if (!open) setImportedProxies(null);
        }}
        onConfirm={() => {
          setCheckDialogOpen(false);
          performProxyCheck();
        }}
        count={importedProxies?.length ?? 0}
      />
    </>
  );
}

function ExtraHeader(props: {
  table: ReactTable<typeof dataTableFeatures, ProfileProxy>;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { trackEvent } = useAptabase();
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  // Batch remove proxies mutation
  const { mutateAsync: removeProxiesBatchMutation } = useMutation({
    mutationKey: ["instance", "proxies", "remove-batch", instanceInfo.id],
    scope: { id: `instance-proxies-${instanceInfo.id}` },
    mutationFn: async (addresses: string[]) => {
      await removeInstanceProxiesBatch(
        addresses,
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

  const selectedProxyCount =
    props.table.getFilteredSelectedRowModel().rows.length;

  const exportSelectedProxies = useCallback(
    (mode: "uri" | "http" | "socks4" | "socks5") => {
      const selectedRows = props.table
        .getFilteredSelectedRowModel()
        .rows.map((r) => r.original);

      void trackEvent("export_proxies", { mode, count: selectedRows.length });

      if (mode === "uri") {
        const lines = selectedRows.map(formatProxyAsURI);
        saveProxyFile(lines.join("\n"), "proxies.txt");
      } else {
        const typeMap = {
          http: ProxyProto_Type.HTTP,
          socks4: ProxyProto_Type.SOCKS4,
          socks5: ProxyProto_Type.SOCKS5,
        };
        const filtered = selectedRows.filter((p) => p.type === typeMap[mode]);
        if (filtered.length === 0) {
          toast.error(t("proxy.export.noProxies"));
          return;
        }
        const lines = filtered.map(formatProxyAsFlat);
        saveProxyFile(lines.join("\n"), `${mode}-proxies.txt`);
      }
    },
    [props.table, trackEvent, t],
  );

  const performProxyCheck = useCallback(() => {
    if (transport === null) {
      return;
    }

    void trackEvent("check_proxies", {
      count: selectedProxyCount,
    });

    const selectedRows = props.table
      .getFilteredSelectedRowModel()
      .rows.map((r) => r.original);

    const abortController = new AbortController();
    const loadingData: ExternalToast = {
      cancel: {
        label: t("common:cancel"),
        onClick: () => {
          abortController.abort();
        },
      },
    };
    const total = selectedRows.length;
    let failed = 0;
    let success = 0;
    const loadingReport = () =>
      t("proxy.checkToast.loading", {
        checked: success + failed,
        total,
        success,
        failed,
      });
    const toastId = toast.loading(loadingReport(), loadingData);
    const service = createClient(ProxyCheckService, transport);
    const responses = service.check(
      {
        instanceId: instanceInfo.id,
        proxy: selectedRows,
      },
      {
        signal: abortController.signal,
      },
    );
    void observeServerStream(responses, {
      onMessage: async (r) => {
        const data = r.data;
        switch (data.case) {
          case "end": {
            toast.success(
              t("proxy.checkToast.success", {
                count: failed,
              }),
              {
                id: toastId,
                cancel: undefined,
              },
            );
            break;
          }
          case "single": {
            if (abortController.signal.aborted) {
              return;
            }

            if (data.value.valid) {
              success++;
            } else {
              failed++;
              // Remove the invalid proxy by address
              const proxyToRemove = data.value.proxy;
              if (proxyToRemove) {
                await removeProxiesBatchMutation([proxyToRemove.address]);
              }
            }

            toast.loading(loadingReport(), {
              id: toastId,
              ...loadingData,
            });
            break;
          }
        }
      },
      onError: (e) => {
        console.error(e);
        toast.error(t("proxy.checkToast.error"), {
          id: toastId,
          cancel: undefined,
        });
      },
    });
  }, [
    transport,
    trackEvent,
    selectedProxyCount,
    props.table,
    t,
    instanceInfo.id,
    removeProxiesBatchMutation,
  ]);

  return (
    <>
      <DataTableActionBarAction
        tooltip={t("proxy.checkSelectedTooltip")}
        onClick={() => setCheckDialogOpen(true)}
      >
        <Wand2Icon />
      </DataTableActionBarAction>
      <ProxyCheckDialog
        open={checkDialogOpen}
        onOpenChange={setCheckDialogOpen}
        onConfirm={() => {
          setCheckDialogOpen(false);
          performProxyCheck();
        }}
        count={selectedProxyCount}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <DataTableActionBarAction
              tooltip={t("proxy.exportSelectedTooltip")}
            />
          }
        >
          <DownloadIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("proxy.export.format")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportSelectedProxies("uri")}>
              {t("proxy.export.uri")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportSelectedProxies("http")}>
              {t("proxy.export.http")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportSelectedProxies("socks4")}>
              {t("proxy.export.socks4")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportSelectedProxies("socks5")}>
              {t("proxy.export.socks5")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DataTableActionBarAction
        tooltip={t("proxy.removeSelectedTooltip")}
        onClick={() => {
          void trackEvent("remove_proxies", {
            count: props.table.getFilteredSelectedRowModel().rows.length,
          });
          const selectedRows = props.table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original);

          toast.promise(
            removeProxiesBatchMutation(selectedRows.map((r) => r.address)),
            {
              loading: t("proxy.removeToast.loading"),
              success: t("proxy.removeToast.success", {
                count: selectedRows.length,
              }),
              error: (e) => {
                console.error(e);
                return t("proxy.removeToast.error");
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

function ProxySettingsSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <DataTableSkeleton
        columnCount={6}
        filterCount={4}
        cellWidths={["2rem", "6rem", "auto", "auto", "auto", "auto"]}
      />
    </div>
  );
}

function ProxySettings() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "settings",
          content: t("breadcrumbs.settings"),
        },
      ]}
      pageName={t("pageName.proxySettings")}
      documentationLink="https://soulfiremc.com/docs/usage/proxies?utm_source=soulfire-client&utm_medium=app&utm_campaign=proxies-docs"
      loadingSkeleton={<ProxySettingsSkeleton />}
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
  const transport = use(TransportContext);
  const queryClient = useQueryClient();
  const { table } = useDataTable({
    data: profile.proxies,
    columns,
    getRowId: (row) => getProxyKey(row),
  });
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<ProfileProxy>();
  const copyToClipboard = useCopyToClipboard();

  const { mutate: removeProxyMutation } = useMutation({
    mutationKey: ["instance", "proxies", "remove-single", instanceInfo.id],
    scope: { id: `instance-proxies-${instanceInfo.id}` },
    mutationFn: async (address: string) => {
      await removeInstanceProxiesBatch(
        [address],
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
      );
    },
    onSuccess: () => {
      toast.success(t("proxy.removeToast.success", { count: 1 }));
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("proxy.removeToast.error"));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: instanceInfoQueryOptions.queryKey,
      });
    },
  });

  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <InstanceSettingsPageComponent
          data={
            instanceInfo.instanceSettings.find(
              (s) => s.id === "proxy",
            ) as SettingsPage
          }
          disabledIds={PROXY_SETTINGS_DISABLED_IDS}
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
          <GetProxiesButton />
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
              copyToClipboard(contextMenu.data.address);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("proxy.contextMenu.copyAddress")}
          </MenuItem>
          {contextMenu.data.username && (
            <MenuItem
              onClick={() => {
                copyToClipboard(contextMenu.data.username ?? "");
                dismiss();
              }}
            >
              <ClipboardCopyIcon />
              {t("proxy.contextMenu.copyUsername")}
            </MenuItem>
          )}
          {contextMenu.data.password && (
            <MenuItem
              onClick={() => {
                copyToClipboard(contextMenu.data.password ?? "");
                dismiss();
              }}
            >
              <ClipboardCopyIcon />
              {t("proxy.contextMenu.copyPassword")}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            variant="destructive"
            onClick={() => {
              removeProxyMutation(contextMenu.data.address);
              dismiss();
            }}
          >
            <TrashIcon />
            {t("proxy.contextMenu.deleteProxy")}
          </MenuItem>
        </ContextMenuPortal>
      )}
    </div>
  );
}

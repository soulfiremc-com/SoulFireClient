import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

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
import { saveAs } from "file-saver";
import {
  ChevronsUpDownIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  HomeIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import { type RefObject, Suspense, use, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatBotFleetSummary } from "@/components/format-bot-fleet-summary.ts";
import { useCreateInstanceContext } from "@/components/dialog/create-instance-context.ts";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { SystemInfoContext } from "@/components/providers/system-info-context.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import { InstanceService } from "@/generated/soulfire/instance_pb";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import { toastDemoReadOnly, toastMutation } from "@/lib/error-toast.ts";
import {
  DemoReadOnlyError,
  setInstanceConfigFull,
} from "@/lib/instance-mutations.ts";
import { createTextBlob } from "@/lib/download.ts";
import { PROJECT_SHORTCUT_LIMIT } from "@/lib/keyboard-shortcuts";
import { formatShortcut } from "@/lib/platform.ts";
import { parseProfileFile, serializeProfileFile } from "@/lib/profile-file.ts";
import type { ProfileRoot } from "@/lib/types.ts";
import {
  hasGlobalPermission,
  hasInstancePermission,
  runAsync,
} from "@/lib/utils.tsx";

function SidebarInstanceButton() {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  const fleetSummary = formatBotFleetSummary(t, instanceInfo.botSummary);
  const totalBots = instanceInfo.botSummary?.totalBots ?? 0;
  const fleetStatus =
    totalBots === 0
      ? t("instanceSidebar.fleetStatusEmpty")
      : t("instanceSidebar.fleetStatus", {
          online: instanceInfo.botSummary?.onlineBots ?? 0,
          count: totalBots,
        });
  return (
    <DropdownMenuTrigger
      render={
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          tooltip={`${instanceInfo.friendlyName} | ${fleetSummary}`}
        />
      }
    >
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <DynamicIcon name={instanceInfo.icon} className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm/tight">
        <span className="max-w-64 truncate font-semibold">
          {instanceInfo.friendlyName}
        </span>
        <span className="truncate text-xs" title={fleetSummary}>
          {fleetStatus}
        </span>
      </div>
      <ChevronsUpDownIcon className="ml-auto" />
    </DropdownMenuTrigger>
  );
}

function SidebarInstanceButtonSkeleton() {
  return (
    <DropdownMenuTrigger
      render={
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        />
      }
    >
      <Skeleton className="relative flex size-8 shrink-0 overflow-hidden rounded-lg" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-12" />
      </div>
      <ChevronsUpDownIcon className="ml-auto" />
    </DropdownMenuTrigger>
  );
}

function InstanceList() {
  const instanceListQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.instanceListQueryOptions,
  });
  const { data: instanceList } = useSuspenseQuery(instanceListQueryOptions);

  return (
    <>
      {instanceList.instances.map((instance, index) => (
        <DropdownMenuItem
          key={instance.id}
          render={
            <Link to="/instance/$instance" params={{ instance: instance.id }} />
          }
        >
          <DynamicIcon name={instance.icon} className="size-4 shrink-0" />
          <span>{instance.friendlyName}</span>
          {isDesktopApp() && index < PROJECT_SHORTCUT_LIMIT && (
            <DropdownMenuShortcut>
              {formatShortcut(`Ctrl+${index + 1}`)}
            </DropdownMenuShortcut>
          )}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function InstanceListSkeleton() {
  return (
    <DropdownMenuItem>
      <Skeleton className="size-4" />
      <Skeleton className="h-3 w-32" />
    </DropdownMenuItem>
  );
}

interface PendingProfileImport {
  fileName: string;
  profile: ProfileRoot;
}

/** Reads and parses a profile file, then asks before it replaces the config. */
type RequestProfileImport = (
  fileName: string,
  readFile: () => Promise<string>,
) => void;

function useProfileImport() {
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const setProfileMutation = useMutation({
    mutationKey: ["instance", "profile", "import", instanceInfo.id],
    scope: { id: `instance-profile-${instanceInfo.id}` },
    mutationFn: async (profile: ProfileRoot) => {
      await setInstanceConfigFull(
        profile,
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

  return {
    instanceInfo,
    importProfile: setProfileMutation.mutateAsync,
    importPending: setProfileMutation.isPending,
  };
}

function InstanceProfileFileInput({
  inputRef,
  onRequestImport,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onRequestImport: RequestProfileImport;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".json"
      className="hidden"
      onChange={(event) => {
        const file = event.currentTarget.files?.item(0);
        event.currentTarget.value = "";
        if (!file) return;
        onRequestImport(file.name, () => file.text());
      }}
    />
  );
}

function InstanceActionButtons({
  onLoadProfile,
  onRequestImport,
}: {
  onLoadProfile: () => void;
  onRequestImport: RequestProfileImport;
}) {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const systemInfo = use(SystemInfoContext);
  // Importing replaces every setting, account, and proxy in the project.
  const canImport = hasInstancePermission(
    instanceInfo,
    InstancePermission.UPDATE_INSTANCE_CONFIG,
  );

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="max-w-64 truncate text-xs text-muted-foreground">
          {instanceInfo.friendlyName}
        </DropdownMenuLabel>
        {!canImport ? null : isDesktopApp() && systemInfo ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UploadIcon className="size-4" />
              {t("instanceSidebar.loadProfile")}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {systemInfo.availableProfiles.length > 0 && (
                  <>
                    {systemInfo.availableProfiles.map((file) => (
                      <DropdownMenuItem
                        key={file}
                        onClick={() => {
                          onRequestImport(file, async () =>
                            desktop.fs.readTextFile(
                              await desktop.path.resolve(
                                await desktop.path.appConfigDir(),
                                "profile",
                                file,
                              ),
                            ),
                          );
                        }}
                      >
                        <FileIcon className="size-4" />
                        {file}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    runAsync(async () => {
                      const profileDir = await desktop.path.resolve(
                        await desktop.path.appConfigDir(),
                        "profile",
                      );
                      await desktop.fs.mkdir(profileDir, { recursive: true });

                      const selected = await desktop.dialog.open({
                        title: t("instanceSidebar.loadProfile"),
                        filters: [
                          {
                            name: t("instanceSidebar.configurationFileType"),
                            extensions: ["json"],
                          },
                        ],
                        defaultPath: profileDir,
                        multiple: false,
                        directory: false,
                      });

                      if (!selected || Array.isArray(selected)) return;
                      onRequestImport(
                        selected.split(/[\\/]/u).at(-1) ?? selected,
                        () => desktop.fs.readTextFile(selected),
                      );
                    });
                  }}
                >
                  <FolderIcon className="size-4" />
                  {t("instanceSidebar.loadFromFile")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem onClick={onLoadProfile}>
            <UploadIcon className="size-4" />
            {t("instanceSidebar.loadProfile")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            const data = serializeProfileFile(profile);
            if (isDesktopApp()) {
              void (async () => {
                const profileDir = await desktop.path.resolve(
                  await desktop.path.appConfigDir(),
                  "profile",
                );
                await desktop.fs.mkdir(profileDir, { recursive: true });

                const selected = await desktop.dialog.save({
                  title: t("instanceSidebar.saveProfile"),
                  filters: [
                    {
                      name: t("instanceSidebar.configurationFileType"),
                      extensions: ["json"],
                    },
                  ],
                  defaultPath: await desktop.path.resolve(
                    profileDir,
                    "soulfire-configuration.json",
                  ),
                });

                // The user closed the save dialog without picking a file.
                // The desktop app adds a missing .json extension itself.
                if (!selected) return;

                await desktop.fs.writeTextFile(selected, data);
                toast.success(t("instanceSidebar.profileSaved"));
              })().catch((error: unknown) => {
                console.error(error);
                toast.error(t("instanceSidebar.profileSaveError"));
              });
            } else {
              saveAs(
                createTextBlob(data, "application/json"),
                "soulfire-configuration.json",
              );
              toast.success(t("instanceSidebar.profileSaved"));
            }
          }}
        >
          <DownloadIcon className="size-4" />
          <span className="flex max-w-64 flex-col gap-1">
            <span>{t("instanceSidebar.saveProfile")}</span>
            <span className="text-xs whitespace-normal text-muted-foreground">
              {t("instanceSidebar.exportWarning")}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}

function InstanceActionButtonsSkeleton() {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="max-w-64 truncate text-xs text-muted-foreground">
        <Skeleton className="h-3 w-32" />
      </DropdownMenuLabel>
      <DropdownMenuItem>
        <Skeleton className="size-4" />

        <Skeleton className="h-3 w-32" />
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

export function InstanceSwitcher() {
  const { t } = useTranslation("common");
  const { isMobile } = useSidebar();
  const { instance } = useParams({ from: "/_dashboard/instance/$instance" });
  const instanceProfileInputRef = useRef<HTMLInputElement>(null);
  // The menu unmounts its content when it closes, so the dialogs live outside it.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingImport, setPendingImport] =
    useState<PendingProfileImport | null>(null);
  const requestImport: RequestProfileImport = (fileName, readFile) => {
    void (async () => {
      let profile: ProfileRoot;
      try {
        profile = parseProfileFile(await readFile());
      } catch (error) {
        console.error(error);
        toast.error(t("instanceSidebar.loadProfileToast.error"));
        return;
      }
      setPendingImport({ fileName, profile });
      setImportOpen(true);
    })();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {!isDesktopApp() && (
          <InstanceProfileFileInput
            inputRef={instanceProfileInputRef}
            onRequestImport={requestImport}
          />
        )}
        <DropdownMenu>
          <Suspense fallback={<SidebarInstanceButtonSkeleton />}>
            <SidebarInstanceButton />
          </Suspense>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("instanceSidebar.instancesGroup")}
              </DropdownMenuLabel>
              <Suspense fallback={<InstanceListSkeleton />}>
                <InstanceList />
              </Suspense>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to="/user" />}>
              <HomeIcon className="size-4" />
              {t("instanceSidebar.backToDashboard")}
            </DropdownMenuItem>
            <Suspense>
              <CreateInstanceButton />
            </Suspense>
            <DropdownMenuSeparator />
            <Suspense fallback={<InstanceActionButtonsSkeleton />}>
              <InstanceActionButtons
                onLoadProfile={() => instanceProfileInputRef.current?.click()}
                onRequestImport={requestImport}
              />
            </Suspense>
            <Suspense>
              <DeleteInstanceMenuItem
                onSelect={() => {
                  setDeleteOpen(true);
                }}
              />
            </Suspense>
          </DropdownMenuContent>
        </DropdownMenu>
        <Suspense>
          <DeleteInstanceDialog
            key={instance}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
        </Suspense>
        <Suspense>
          <ImportProfileDialog
            key={instance}
            pending={pendingImport}
            open={importOpen}
            onOpenChange={setImportOpen}
          />
        </Suspense>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ImportProfileDialog({
  pending,
  open,
  onOpenChange,
}: {
  pending: PendingProfileImport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const { instanceInfo, importProfile } = useProfileImport();

  return (
    <AlertDialog open={open && pending !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <UploadIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("dialog.importConfiguration.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialog.importConfiguration.description", {
              file: pending?.fileName ?? "",
              name: instanceInfo.friendlyName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              if (!pending) return;
              // A demo write fails with the demo notice from the mutation cache.
              toastMutation(importProfile(pending.profile), {
                loading: t("instanceSidebar.loadProfileToast.loading"),
                success: t("instanceSidebar.loadProfileToast.success"),
                error: t("instanceSidebar.loadProfileToast.error"),
              }).catch(() => {
                // toastMutation already reported the failure.
              });
            }}
          >
            {t("dialog.importConfiguration.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateInstanceButton() {
  const { t } = useTranslation("common");
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const { openCreateInstance } = useCreateInstanceContext();

  if (!hasGlobalPermission(clientInfo, GlobalPermission.CREATE_INSTANCE)) {
    return null;
  }

  return (
    <DropdownMenuItem onClick={openCreateInstance}>
      <PlusIcon className="size-4" />
      {t("instanceSidebar.createInstance")}
    </DropdownMenuItem>
  );
}

function useDeletableInstance() {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  return {
    instanceInfo,
    canDelete: hasInstancePermission(
      instanceInfo,
      InstancePermission.DELETE_INSTANCE,
    ),
  };
}

function DeleteInstanceMenuItem({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation("common");
  const { canDelete } = useDeletableInstance();
  if (!canDelete) return null;

  return (
    <DropdownMenuItem onClick={onSelect}>
      <TrashIcon />
      {t("instanceSidebar.deleteInstance")}
    </DropdownMenuItem>
  );
}

function DeleteInstanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const instanceListQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.instanceListQueryOptions,
  });
  const transport = use(TransportContext);
  const { instanceInfo, canDelete } = useDeletableInstance();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationKey: ["instance", "delete"],
    mutationFn: async (instanceId: string) => {
      if (transport === null) throw DemoReadOnlyError.make({});

      const instanceService = createRpcClient(InstanceService, transport);
      return toastMutation(
        Effect.runPromise(instanceService.deleteInstance({ id: instanceId })),
        {
          loading: t("instanceSidebar.deleteToast.loading"),
          success: t("instanceSidebar.deleteToast.success"),
          error: t("instanceSidebar.deleteToast.error"),
        },
      );
    },
    // Leave the project only after the server deleted it. This runs in the
    // mutation, not in `mutate()`, because the project layout can unmount this
    // dialog once its next poll finds the project gone.
    onSuccess: () => {
      onOpenChange(false);
      void navigate({ to: "/user" });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: instanceListQueryOptions.queryKey,
      });
    },
  });

  if (!canDelete) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleteMutation.isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("dialog.deleteInstance.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialog.deleteInstance.description", {
              name: instanceInfo.friendlyName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            {t("dialog.createInstance.form.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (transport === null) {
                onOpenChange(false);
                toastDemoReadOnly();
                return;
              }
              deleteMutation.mutate(instanceInfo.id);
            }}
          >
            {t("instanceSidebar.deleteInstance")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

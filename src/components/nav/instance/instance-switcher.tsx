import { createClient } from "@connectrpc/connect";
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
import { formatBotFleetSummary } from "@/components/bot-fleet-summary.tsx";
import { CreateInstanceContext } from "@/components/dialog/create-instance-dialog.tsx";
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
import { createTextBlob } from "@/lib/download.ts";
import { formatShortcut } from "@/lib/platform.ts";
import { parseProfileFile, serializeProfileFile } from "@/lib/profile-file.ts";
import type { ProfileRoot } from "@/lib/types.ts";
import {
  hasGlobalPermission,
  hasInstancePermission,
  runAsync,
  setInstanceConfigFull,
} from "@/lib/utils.tsx";

function SidebarInstanceButton() {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  const fleetSummary = formatBotFleetSummary(t, instanceInfo.botSummary);
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
      <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
        <DynamicIcon name={instanceInfo.icon} className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="max-w-64 truncate font-semibold">
          {instanceInfo.friendlyName}
        </span>
        <span className="truncate text-xs">{fleetSummary}</span>
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
      <Skeleton className="relative flex size-8 h-10 w-10 shrink-0 overflow-hidden rounded-lg" />
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
      {instanceList.instances.map((instance, index) => {
        return (
          <DropdownMenuItem
            key={instance.id}
            render={
              <Link
                to="/instance/$instance"
                params={{ instance: instance.id }}
              />
            }
          >
            <DynamicIcon name={instance.icon} className="size-4 shrink-0" />
            {instance.friendlyName}
            <DropdownMenuShortcut>
              {formatShortcut(`Ctrl+${index + 1}`)}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function InstanceListSkeleton() {
  return (
    <DropdownMenuItem>
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-3 w-32" />
    </DropdownMenuItem>
  );
}

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

  return { instanceInfo, importProfile: setProfileMutation.mutateAsync };
}

function InstanceProfileFileInput({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation("common");
  const { importProfile } = useProfileImport();

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

        toast.promise(
          (async () => {
            const data = await file.text();
            await importProfile(parseProfileFile(data));
          })(),
          {
            loading: t("instanceSidebar.loadProfileToast.loading"),
            success: t("instanceSidebar.loadProfileToast.success"),
            error: (error) => {
              console.error(error);
              return t("instanceSidebar.loadProfileToast.error");
            },
          },
        );
      }}
    />
  );
}

function InstanceActionButtons({
  onLoadProfile,
}: {
  onLoadProfile: () => void;
}) {
  const { t } = useTranslation("common");
  const { instanceInfo, importProfile } = useProfileImport();
  const profile = instanceInfo.profile;
  const systemInfo = use(SystemInfoContext);

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-muted-foreground max-w-64 truncate text-xs">
          {instanceInfo.friendlyName}
        </DropdownMenuLabel>
        {isDesktopApp() && systemInfo ? (
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
                          const loadProfile = async () => {
                            const data = await desktop.fs.readTextFile(
                              await desktop.path.resolve(
                                await desktop.path.resolve(
                                  await desktop.path.appConfigDir(),
                                  "profile",
                                ),
                                file,
                              ),
                            );

                            await importProfile(parseProfileFile(data));
                          };
                          toast.promise(loadProfile(), {
                            loading: t(
                              "instanceSidebar.loadProfileToast.loading",
                            ),
                            success: t(
                              "instanceSidebar.loadProfileToast.success",
                            ),
                            error: (e) => {
                              console.error(e);
                              return t(
                                "instanceSidebar.loadProfileToast.error",
                              );
                            },
                          });
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
                        filters: systemInfo.mobile
                          ? undefined
                          : [
                              {
                                name: "SoulFire JSON Profile",
                                extensions: ["json"],
                              },
                            ],
                        defaultPath: profileDir,
                        multiple: false,
                        directory: false,
                      });

                      if (selected) {
                        if (Array.isArray(selected)) {
                          return;
                        }
                        const data = await desktop.fs.readTextFile(selected);
                        toast.promise(
                          (async () => {
                            await importProfile(parseProfileFile(data));
                          })(),
                          {
                            loading: t(
                              "instanceSidebar.loadProfileToast.loading",
                            ),
                            success: t(
                              "instanceSidebar.loadProfileToast.success",
                            ),
                            error: (e) => {
                              console.error(e);
                              return t(
                                "instanceSidebar.loadProfileToast.error",
                              );
                            },
                          },
                        );
                      }
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
              runAsync(async () => {
                const profileDir = await desktop.path.resolve(
                  await desktop.path.appConfigDir(),
                  "profile",
                );
                await desktop.fs.mkdir(profileDir, { recursive: true });

                let selected = await desktop.dialog.save({
                  title: t("instanceSidebar.saveProfile"),
                  filters: [
                    {
                      name: "SoulFire JSON Profile",
                      extensions: ["json"],
                    },
                  ],
                  defaultPath: profileDir,
                });

                if (selected) {
                  if (!selected.endsWith(".json")) {
                    selected += ".json";
                  }

                  await desktop.fs.writeTextFile(selected, data);
                }
              });
            } else {
              saveAs(createTextBlob(data, "application/json"), "profile.json");
            }

            toast.success(t("instanceSidebar.profileSaved"));
          }}
        >
          <DownloadIcon className="size-4" />
          {t("instanceSidebar.saveProfile")}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}

function InstanceActionButtonsSkeleton() {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-muted-foreground max-w-64 truncate text-xs">
        <Skeleton className="h-3 w-32" />
      </DropdownMenuLabel>
      <DropdownMenuItem>
        <Skeleton className="h-4 w-4" />

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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {!isDesktopApp() && (
          <Suspense>
            <InstanceProfileFileInput
              key={instance}
              inputRef={instanceProfileInputRef}
            />
          </Suspense>
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
              <DropdownMenuLabel className="text-muted-foreground text-xs">
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
              />
            </Suspense>
            <Suspense>
              <DeleteInstanceButton />
            </Suspense>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function CreateInstanceButton() {
  const { t } = useTranslation("common");
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const { openCreateInstance } = use(CreateInstanceContext);

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

function DeleteInstanceButton() {
  const { t } = useTranslation("common");
  const instanceListQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.instanceListQueryOptions,
  });
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationKey: ["instance", "delete"],
    mutationFn: async (instanceId: string) => {
      if (transport === null) {
        return;
      }

      const instanceService = createClient(InstanceService, transport);
      const promise = instanceService
        .deleteInstance({
          id: instanceId,
        })
        .then((r) => r);
      toast.promise(promise, {
        loading: t("instanceSidebar.deleteToast.loading"),
        success: t("instanceSidebar.deleteToast.success"),
        error: (e) => {
          console.error(e);
          return t("instanceSidebar.deleteToast.error");
        },
      });

      return promise;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: instanceListQueryOptions.queryKey,
      });
    },
  });

  if (
    !hasInstancePermission(instanceInfo, InstancePermission.DELETE_INSTANCE)
  ) {
    return null;
  }

  return (
    <>
      <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
        <TrashIcon />
        {t("instanceSidebar.deleteInstance")}
      </DropdownMenuItem>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete instance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{instanceInfo.friendlyName}" and its
              data. This action cannot be undone.
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
                deleteMutation.mutate(instanceInfo.id);
                setDeleteOpen(false);
                void navigate({
                  to: "/user",
                });
              }}
            >
              {t("instanceSidebar.deleteInstance")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

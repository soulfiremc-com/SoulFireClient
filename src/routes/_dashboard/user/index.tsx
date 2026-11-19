import { createRpcClient } from "@/lib/rpc";
import { toFormSchema } from "@/lib/form-validation";
import { Effect, Schema } from "effect";

import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  CopyPlusIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PlayIcon,
  PlusIcon,
  SearchXIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { type ComponentType, use, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BotFleetSummaryBadge } from "@/components/bot-fleet-summary.tsx";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useCreateInstanceContext } from "@/components/dialog/create-instance-context.ts";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
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
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  BotDesiredState,
  type BotFleetSummary,
  BotService,
} from "@/generated/soulfire/bot_pb";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import type { InstanceListResponse_Instance } from "@/generated/soulfire/instance_pb";
import { InstanceService } from "@/generated/soulfire/instance_pb";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import i18n from "@/lib/i18n";
import {
  createInstanceNameSchema,
  getDuplicateInstanceName,
} from "@/lib/instance-name.ts";
import { formatShortcut, isDesktopApp } from "@/lib/desktop.ts";
import { isPostHogConfigured } from "@/lib/posthog.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasGlobalPermission, hasInstancePermission } from "@/lib/utils.tsx";
import { generateN } from "@/lib/generate-n.ts";

export const Route = createFileRoute("/_dashboard/user/")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.instances"), {
      kind: "dynamic",
      name: "grid-2x2",
    }),
  component: InstanceSelectPage,
});

// Matches the Ctrl/Cmd+1-9 handler in the dashboard layout.
const MAX_INSTANCE_SHORTCUTS = 9;

interface StateAction {
  key: "start" | "stop";
  desiredState: BotDesiredState;
  Icon: ComponentType<{ className?: string }>;
}

interface DuplicateInstanceForm {
  friendlyName: string;
}

function getAvailableStateActions(summary?: BotFleetSummary): StateAction[] {
  const actions: StateAction[] = [];
  if ((summary?.desiredBots ?? 0) < (summary?.totalBots ?? 0)) {
    actions.push({
      key: "start",
      desiredState: BotDesiredState.RUNNING,
      Icon: PlayIcon,
    });
  }
  if ((summary?.desiredBots ?? 0) > 0) {
    actions.push({
      key: "stop",
      desiredState: BotDesiredState.STOPPED,
      Icon: SquareIcon,
    });
  }
  return actions;
}

function DuplicateInstanceDialog({
  sourceInstance,
  open,
  onOpenChange,
  onDuplicate,
  pending,
}: {
  sourceInstance: InstanceListResponse_Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicate: (value: DuplicateInstanceForm) => Promise<void>;
  pending: boolean;
}) {
  const { t } = useTranslation("common");
  const formSchema = Schema.Struct({
    friendlyName: createInstanceNameSchema({
      required: t("instanceName.required"),
      max: t("instanceName.max"),
      singleLine: t("instanceName.singleLine"),
    }),
  });
  const form = useForm({
    defaultValues: {
      friendlyName: sourceInstance
        ? getDuplicateInstanceName(sourceInstance.friendlyName)
        : "",
    },
    validators: {
      onSubmit: toFormSchema(formSchema),
    },
    onSubmit: async ({ value }) => {
      try {
        await onDuplicate(Schema.decodeSync(formSchema)(value));
      } catch {
        // The mutation reports errors and keeps the draft available for corrections.
      }
    },
  });

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="pb-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <CredenzaHeader>
            <CredenzaTitle>{t("dialog.duplicateInstance.title")}</CredenzaTitle>
            <CredenzaDescription>
              {t("dialog.duplicateInstance.description", {
                name: sourceInstance?.friendlyName ?? "",
              })}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody>
            <form.Field name="friendlyName">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("dialog.createInstance.form.friendlyName.label")}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      autoFocus
                      disabled={pending}
                      placeholder={t(
                        "dialog.createInstance.form.friendlyName.placeholder",
                      )}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      aria-invalid={isInvalid}
                    />
                    <FieldDescription>
                      {t(
                        "dialog.duplicateInstance.form.friendlyName.description",
                      )}
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>
          </CredenzaBody>
          <CredenzaFooter className="justify-between">
            <CredenzaClose
              render={<Button variant="outline" disabled={pending} />}
            >
              <XIcon />
              {t("dialog.createInstance.form.cancel")}
            </CredenzaClose>
            <Button type="submit" disabled={pending || sourceInstance === null}>
              {pending ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <CopyPlusIcon />
              )}
              {t("dialog.duplicateInstance.form.duplicate")}
            </Button>
          </CredenzaFooter>
        </form>
      </CredenzaContent>
    </Credenza>
  );
}

function InstanceCardSkeleton() {
  return (
    <div className="flex w-full flex-row items-center gap-4 rounded-lg border px-6 py-4">
      <Skeleton className="size-12 rounded-lg" />
      <div className="flex grow flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="size-8" />
    </div>
  );
}

function InstanceListSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
      {generateN(4).map((item) => (
        <InstanceCardSkeleton key={item} />
      ))}
    </div>
  );
}

function InstanceSelectPage() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout
      showUserCrumb
      pageName={t("pageName.instances")}
      loadingSkeleton={<InstanceListSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const posthog = usePostHog();
  const { clientDataQueryOptions, instanceListQueryOptions } =
    Route.useRouteContext();
  const { data: instanceList } = useSuspenseQuery(instanceListQueryOptions);
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const navigate = useNavigate();
  const transport = use(TransportContext);
  const queryClient = useQueryClient();
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<InstanceListResponse_Instance>();
  const copyToClipboard = useCopyToClipboard();
  const [duplicateSource, setDuplicateSource] =
    useState<InstanceListResponse_Instance | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<InstanceListResponse_Instance | null>(null);

  const stateMutation = useMutation({
    mutationKey: ["bots", "desired-state", "list"],
    mutationFn: async ({
      instanceId,
      desiredState,
      action,
    }: {
      instanceId: string;
      desiredState: BotDesiredState;
      action: StateAction["key"];
    }) => {
      if (transport === null) {
        toast.info(t("demoReadOnly"));
        return undefined;
      }
      const botService = createRpcClient(BotService, transport);
      const promise = Effect.runPromise(
        botService.getBotList({ instanceId }),
      ).then((list) =>
        Effect.runPromise(
          botService.setBotsDesiredState({
            instanceId,
            botIds: list.bots
              .filter((bot) => bot.status?.desiredState !== desiredState)
              .map((bot) => bot.profileId),
            desiredState,
          }),
        ),
      );
      toast.promise(promise, {
        loading: t(`controls.${action}Toast.loading`),
        success: t(`controls.${action}Toast.success`),
        error: (e) => {
          console.error(e);
          return t(`controls.${action}Toast.error`);
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

  const duplicateMutation = useMutation({
    mutationKey: ["instance", "duplicate"],
    mutationFn: async ({
      sourceInstance,
      friendlyName,
    }: {
      sourceInstance: InstanceListResponse_Instance;
      friendlyName: string;
    }) => {
      if (transport === null) {
        toast.info(t("demoReadOnly"));
        setDuplicateSource(null);
        return undefined;
      }
      const promise = Effect.runPromise(
        createRpcClient(InstanceService, transport).duplicateInstance({
          id: sourceInstance.id,
          friendlyName,
        }),
      );

      toast.promise(promise, {
        loading: t("dialog.duplicateInstance.duplicateToast.loading"),
        success: (created) => {
          if (isPostHogConfigured) {
            posthog.capture("instance_duplicated");
          }
          setDuplicateSource(null);
          void navigate({
            to: "/instance/$instance",
            params: { instance: created.id },
          });
          return t("dialog.duplicateInstance.duplicateToast.success");
        },
        error: (e) => {
          console.error(e);
          return t("dialog.duplicateInstance.duplicateToast.error");
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

  const deleteMutation = useMutation({
    mutationKey: ["instance", "delete"],
    mutationFn: async (instanceId: string) => {
      if (transport === null) {
        toast.info(t("demoReadOnly"));
        return undefined;
      }
      const instanceService = createRpcClient(InstanceService, transport);
      const promise = Effect.runPromise(
        instanceService.deleteInstance({ id: instanceId }),
      ).then((r) => r);
      toast.promise(promise, {
        loading: t("instanceSidebar.deleteToast.loading"),
        success: () => {
          if (isPostHogConfigured) {
            posthog.capture("instance_deleted");
          }
          return t("instanceSidebar.deleteToast.success");
        },
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

  const canCreateInstance = hasGlobalPermission(
    clientInfo,
    GlobalPermission.CREATE_INSTANCE,
  );
  // One set of items for the right-click menu and the card's actions button.
  const renderInstanceActions = (
    instance: InstanceListResponse_Instance,
    close: () => void,
  ) => {
    const stateActions = hasInstancePermission(
      instance,
      InstancePermission.CONTROL_BOTS,
    )
      ? getAvailableStateActions(instance.botSummary)
      : [];
    const canDelete = hasInstancePermission(
      instance,
      InstancePermission.DELETE_INSTANCE,
    );
    return (
      <>
        <DropdownMenuItem
          onClick={() => {
            void navigate({
              to: "/instance/$instance",
              params: { instance: instance.id },
            });
            close();
          }}
        >
          <ExternalLinkIcon />
          {t("contextMenu.instance.goToInstance")}
        </DropdownMenuItem>
        {canCreateInstance && (
          <DropdownMenuItem
            onClick={() => {
              setDuplicateSource(instance);
              close();
            }}
          >
            <CopyPlusIcon />
            {t("contextMenu.instance.duplicateInstance")}
          </DropdownMenuItem>
        )}
        {stateActions.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {stateActions.map((action) => (
              <DropdownMenuItem
                key={action.key}
                onClick={() => {
                  stateMutation.mutate({
                    instanceId: instance.id,
                    desiredState: action.desiredState,
                    action: action.key,
                  });
                  close();
                }}
              >
                <action.Icon />
                {t(`controls.${action.key}`)}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void copyToClipboard(instance.friendlyName);
            close();
          }}
        >
          <ClipboardCopyIcon />
          {t("contextMenu.instance.copyInstanceName")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void copyToClipboard(instance.id);
            close();
          }}
        >
          <ClipboardCopyIcon />
          {t("contextMenu.instance.copyInstanceId")}
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setDeleteTarget(instance);
                close();
              }}
            >
              <TrashIcon />
              {t("contextMenu.instance.deleteInstance")}
            </DropdownMenuItem>
          </>
        )}
      </>
    );
  };

  return (
    <>
      {instanceList.instances.length === 0 ? (
        <div className="flex size-full flex-1">
          <Empty className="m-auto max-w-md border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{t("noInstancesFound")}</EmptyTitle>
              <EmptyDescription>
                {canCreateInstance
                  ? t("noInstancesDescription")
                  : t("noInstancesNoPermission")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CreateInstanceButton />
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <ItemGroup className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
          {instanceList.instances.map((instance, index) => {
            return (
              <div
                key={instance.id}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- ItemGroup from shadcn/ui renders a div with the list role, so its items cannot be li elements
                role="listitem"
                className="relative max-h-fit"
              >
                <Item
                  variant="outline"
                  className="w-full rounded-lg py-4 pr-14 pl-6"
                  render={
                    <Link
                      to="/instance/$instance"
                      params={{ instance: instance.id }}
                      search={{}}
                      onContextMenu={(e) => {
                        handleContextMenu(e, instance);
                      }}
                    />
                  }
                >
                  <ItemMedia>
                    <div className="flex aspect-square size-12 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <DynamicIcon
                        name={instance.icon}
                        className="size-8 shrink-0"
                      />
                    </div>
                  </ItemMedia>
                  <ItemContent className="gap-1.5">
                    <ItemTitle className="max-w-64 truncate">
                      {instance.friendlyName}
                    </ItemTitle>
                    <div data-slot="item-description">
                      <BotFleetSummaryBadge summary={instance.botSummary} />
                    </div>
                  </ItemContent>
                  {isDesktopApp() && index < MAX_INSTANCE_SHORTCUTS && (
                    <div className="ml-auto hidden shrink-0 sm:block">
                      <Kbd aria-hidden="true" className="h-6 px-2 text-sm">
                        {formatShortcut(`Ctrl+${index + 1}`)}
                      </Kbd>
                    </div>
                  )}
                </Item>
                {/* Touch screens cannot open the right-click menu, so the same actions live here. */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 right-3 -translate-y-1/2"
                        aria-label={t("contextMenu.instance.actions", {
                          name: instance.friendlyName,
                        })}
                      />
                    }
                  >
                    <EllipsisVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuGroup>
                      {renderInstanceActions(instance, () => {})}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </ItemGroup>
      )}
      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          {renderInstanceActions(contextMenu.data, dismiss)}
        </ContextMenuPortal>
      )}
      <DuplicateInstanceDialog
        key={duplicateSource?.id ?? "closed"}
        sourceInstance={duplicateSource}
        open={duplicateSource !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateSource(null);
          }
        }}
        pending={duplicateMutation.isPending}
        onDuplicate={async (value) => {
          if (duplicateSource === null) {
            return;
          }

          await duplicateMutation.mutateAsync({
            sourceInstance: duplicateSource,
            friendlyName: value.friendlyName,
          });
        }}
      />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
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
              {deleteTarget
                ? t("dialog.deleteInstance.description", {
                    name: deleteTarget.friendlyName,
                  })
                : t("dialog.deleteInstance.descriptionUnnamed")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("dialog.createInstance.form.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) {
                  return;
                }

                deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
              disabled={deleteMutation.isPending}
            >
              {t("contextMenu.instance.deleteInstance")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
    <Button onClick={openCreateInstance} variant="outline" className="w-fit">
      <PlusIcon data-icon="inline-start" />
      {t("instanceSidebar.createInstance")}
    </Button>
  );
}

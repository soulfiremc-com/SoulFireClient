import { createClient } from "@connectrpc/connect";
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
  ExternalLinkIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchXIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { type ComponentType, use, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  MenuItem,
  MenuSeparator,
} from "@/components/context-menu-primitives.tsx";
import { CreateInstanceContext } from "@/components/dialog/create-instance-dialog.tsx";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { InstanceStateIndicator } from "@/components/instance-state-indicator.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
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
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb.ts";
import type { InstanceListResponse_Instance } from "@/generated/soulfire/instance_pb.ts";
import {
  InstanceService,
  InstanceState,
} from "@/generated/soulfire/instance_pb.ts";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasGlobalPermission, hasInstancePermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.instances"), {
      kind: "dynamic",
      name: "grid-2x2",
    }),
  component: InstanceSelectPage,
});

type StateAction = {
  key: "start" | "pause" | "resume" | "stop";
  state: InstanceState;
  Icon: ComponentType<{ className?: string }>;
};

type DuplicateInstanceForm = {
  friendlyName: string;
};

function generateN(count: number) {
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    (_, index) => index + 1,
  );
}

function getDuplicateInstanceName(friendlyName: string) {
  const suffix = " Copy";
  const maxLength = 32;
  const baseName = friendlyName.trim();
  if (baseName.length + suffix.length <= maxLength) {
    return `${baseName}${suffix}`;
  }

  return `${baseName.slice(0, maxLength - suffix.length).trimEnd()}${suffix}`;
}

function getAvailableStateActions(state: InstanceState): StateAction[] {
  switch (state) {
    case InstanceState.STOPPED:
      return [{ key: "start", state: InstanceState.RUNNING, Icon: PlayIcon }];
    case InstanceState.RUNNING:
      return [
        { key: "pause", state: InstanceState.PAUSED, Icon: PauseIcon },
        { key: "stop", state: InstanceState.STOPPED, Icon: SquareIcon },
      ];
    case InstanceState.PAUSED:
      return [
        { key: "resume", state: InstanceState.RUNNING, Icon: PlayIcon },
        { key: "stop", state: InstanceState.STOPPED, Icon: SquareIcon },
      ];
    case InstanceState.STARTING:
    case InstanceState.STOPPING:
      return [];
  }
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
  onDuplicate: (value: DuplicateInstanceForm) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("common");
  const formSchema = z.object({
    friendlyName: z
      .string()
      .min(3, t("dialog.createInstance.form.friendlyName.min"))
      .max(32, t("dialog.createInstance.form.friendlyName.max"))
      .regex(
        /^[a-zA-Z0-9 ]+$/,
        t("dialog.createInstance.form.friendlyName.regex"),
      ),
  });
  const form = useForm({
    defaultValues: {
      friendlyName: sourceInstance
        ? getDuplicateInstanceName(sourceInstance.friendlyName)
        : "",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      onDuplicate(value);
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
                      placeholder={t(
                        "dialog.createInstance.form.friendlyName.placeholder",
                      )}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
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
            <CredenzaClose asChild>
              <Button variant="outline" disabled={pending}>
                <XIcon />
                {t("dialog.createInstance.form.cancel")}
              </Button>
            </CredenzaClose>
            <Button type="submit" disabled={pending || sourceInstance === null}>
              <CopyPlusIcon />
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
      <Skeleton className="h-8 w-8" />
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
      showUserCrumb={true}
      pageName={t("pageName.instances")}
      loadingSkeleton={<InstanceListSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
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

  const stateMutation = useMutation({
    mutationKey: ["instance", "state", "list"],
    mutationFn: async ({
      instanceId,
      state,
      action,
    }: {
      instanceId: string;
      state: InstanceState;
      action: StateAction["key"];
    }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      const promise = instanceService
        .changeInstanceState({
          id: instanceId,
          state,
        })
        .then((r) => r);
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
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      const promise = (async () => {
        const sourceResponse = await instanceService.getInstanceInfo({
          id: sourceInstance.id,
        });
        if (
          sourceResponse.result.case !== "info" ||
          sourceResponse.result.value.config === undefined
        ) {
          throw new Error("Source instance profile is unavailable");
        }

        const sourceInfo = sourceResponse.result.value;
        const created = await instanceService.createInstance({
          friendlyName,
        });
        await instanceService.updateInstanceConfig({
          id: created.id,
          config: sourceInfo.config,
        });
        if (sourceInfo.icon !== "") {
          await instanceService.updateInstanceMeta({
            id: created.id,
            meta: {
              case: "icon",
              value: sourceInfo.icon,
            },
          });
        }

        return created;
      })();

      toast.promise(promise, {
        loading: t("dialog.duplicateInstance.duplicateToast.loading"),
        success: (created) => {
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
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      const promise = instanceService
        .deleteInstance({ id: instanceId })
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

  const contextStateActions =
    contextMenu &&
    hasInstancePermission(
      contextMenu.data,
      InstancePermission.CHANGE_INSTANCE_STATE,
    )
      ? getAvailableStateActions(contextMenu.data.state)
      : [];
  const canDeleteContextInstance =
    contextMenu &&
    hasInstancePermission(contextMenu.data, InstancePermission.DELETE_INSTANCE);
  const canCreateInstance = hasGlobalPermission(
    clientInfo,
    GlobalPermission.CREATE_INSTANCE,
  );

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
              <Link
                key={instance.id}
                to="/instance/$instance"
                params={{ instance: instance.id }}
                search={{}}
                className="max-h-fit w-full"
                onContextMenu={(e) => handleContextMenu(e, instance)}
              >
                <Item variant="outline" className="w-full rounded-lg px-6 py-4">
                  <ItemMedia>
                    <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-12 items-center justify-center rounded-lg">
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
                      <InstanceStateIndicator state={instance.state} />
                    </div>
                  </ItemContent>
                  <div className="ml-auto shrink-0">
                    <Kbd className="h-6 px-2 text-sm tracking-widest opacity-60">
                      ⌘{index + 1}
                    </Kbd>
                  </div>
                </Item>
              </Link>
            );
          })}
        </ItemGroup>
      )}
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <MenuItem
            onClick={() => {
              void navigate({
                to: "/instance/$instance",
                params: { instance: contextMenu.data.id },
              });
              dismiss();
            }}
          >
            <ExternalLinkIcon />
            {t("contextMenu.instance.goToInstance")}
          </MenuItem>
          {canCreateInstance && (
            <MenuItem
              onClick={() => {
                setDuplicateSource(contextMenu.data);
                dismiss();
              }}
            >
              <CopyPlusIcon />
              {t("contextMenu.instance.duplicateInstance")}
            </MenuItem>
          )}
          {contextStateActions.length > 0 && (
            <>
              <MenuSeparator />
              {contextStateActions.map((action) => (
                <MenuItem
                  key={action.key}
                  onClick={() => {
                    stateMutation.mutate({
                      instanceId: contextMenu.data.id,
                      state: action.state,
                      action: action.key,
                    });
                    dismiss();
                  }}
                >
                  <action.Icon />
                  {t(`controls.${action.key}`)}
                </MenuItem>
              ))}
            </>
          )}
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.friendlyName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("contextMenu.instance.copyInstanceName")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.id);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("contextMenu.instance.copyInstanceId")}
          </MenuItem>
          {canDeleteContextInstance && (
            <>
              <MenuSeparator />
              <MenuItem
                variant="destructive"
                onClick={() => {
                  deleteMutation.mutate(contextMenu.data.id);
                  dismiss();
                }}
              >
                <TrashIcon />
                {t("contextMenu.instance.deleteInstance")}
              </MenuItem>
            </>
          )}
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
        onDuplicate={(value) => {
          if (duplicateSource === null) {
            return;
          }

          duplicateMutation.mutate({
            sourceInstance: duplicateSource,
            friendlyName: value.friendlyName,
          });
        }}
      />
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
  const { openCreateInstance } = use(CreateInstanceContext);

  if (!hasGlobalPermission(clientInfo, GlobalPermission.CREATE_INSTANCE)) {
    return null;
  }

  return (
    <Button onClick={openCreateInstance} variant="outline" className="w-fit">
      <PlusIcon className="size-4" />
      {t("instanceSidebar.createInstance")}
    </Button>
  );
}

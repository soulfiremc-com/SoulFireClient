import { createClient } from "@connectrpc/connect";
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
  ExternalLinkIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchXIcon,
  SquareIcon,
  TrashIcon,
} from "lucide-react";
import { type ComponentType, use } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  MenuItem,
  MenuSeparator,
} from "@/components/context-menu-primitives.tsx";
import { CreateInstanceContext } from "@/components/dialog/create-instance-dialog.tsx";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
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
import { translateInstanceState } from "@/lib/types.ts";
import {
  cn,
  hasGlobalPermission,
  hasInstancePermission,
} from "@/lib/utils.tsx";

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

const stateIndicatorStyles: Record<InstanceState, string> = {
  [InstanceState.STARTING]:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  [InstanceState.RUNNING]:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  [InstanceState.PAUSED]:
    "border-muted-foreground/30 bg-muted text-muted-foreground",
  [InstanceState.STOPPING]:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  [InstanceState.STOPPED]: "border-border bg-background text-muted-foreground",
};

const stateIndicatorIcons: Record<
  InstanceState,
  ComponentType<{ className?: string }>
> = {
  [InstanceState.STARTING]: LoaderCircleIcon,
  [InstanceState.RUNNING]: PlayIcon,
  [InstanceState.PAUSED]: PauseIcon,
  [InstanceState.STOPPING]: LoaderCircleIcon,
  [InstanceState.STOPPED]: SquareIcon,
};

function generateN(count: number) {
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    (_, index) => index + 1,
  );
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

function InstanceStateIndicator({ state }: { state: InstanceState }) {
  const { i18n } = useTranslation("common");
  const Icon = stateIndicatorIcons[state];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        stateIndicatorStyles[state],
      )}
    >
      <Icon
        className={cn(
          "size-3.5",
          (state === InstanceState.STARTING ||
            state === InstanceState.STOPPING) &&
            "animate-spin",
        )}
      />
      {translateInstanceState(i18n, state)}
    </span>
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
  const { instanceListQueryOptions } = Route.useRouteContext();
  const { data: instanceList } = useSuspenseQuery(instanceListQueryOptions);
  const navigate = useNavigate();
  const transport = use(TransportContext);
  const queryClient = useQueryClient();
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<InstanceListResponse_Instance>();
  const copyToClipboard = useCopyToClipboard();

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

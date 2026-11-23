import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { create } from "@bufbuild/protobuf";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BackpackIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ClipboardCopyIcon,
  CompassIcon,
  EyeIcon,
  Gamepad2Icon,
  MonitorIcon,
  NetworkIcon,
  PlayIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { Activity, Suspense, use, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BotChatBox } from "@/components/bot-view/bot-chat-box.tsx";
import { BotControlsTab } from "@/components/bot-view/bot-controls.tsx";
import { BotInventoryPanel } from "@/components/bot-view/bot-inventory-panel.tsx";
import { BotPanel, BotPanelEmpty } from "@/components/bot-view/bot-panel.tsx";
import {
  botDialogQueryOptions,
  botInfoQueryOptions,
  toastError,
} from "@/components/bot-view/bot-queries.ts";
import { BotVisualPanel } from "@/components/bot-view/bot-visual-panel.tsx";
import { BotStateBadge } from "@/components/instance-overview/bot-grid.tsx";
import { getFailureFix } from "@/components/instance-overview/fleet-status-meta.ts";
import { LiveFeed } from "@/components/instance-overview/live-feed.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  type BotDisplayState,
  classifyBotFailure,
  getBotDisplayState,
} from "@/lib/bot-fleet.ts";
import CommandInput from "@/components/command-input.tsx";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { BotPovPlayer } from "@/components/pov/bot-pov-player";
import {
  getPovConnectionStep,
  POV_WAITING_STEPS,
} from "@/lib/pov-connection-step";
import { ProxyAddress } from "@/components/ProxyAddress.tsx";
import { TerminalComponent } from "@/components/terminal.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  BotConnectionPhase,
  BotDesiredState,
  BotService,
  GameMode,
} from "@/generated/soulfire/bot_pb";
import {
  BotCommandScopeSchema,
  type CommandScope,
  CommandScopeSchema,
} from "@/generated/soulfire/command_pb";
import {
  InstancePermission,
  MinecraftAccountProto_AccountTypeProto,
  ProxyProto_Type,
} from "@/generated/soulfire/common_pb";
import {
  BotLogScopeSchema,
  type LogScope,
  LogScopeSchema,
} from "@/generated/soulfire/logs_pb";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import {
  accountTypeToIcon,
  translateAccountType,
} from "@/lib/account-types.ts";
import i18n from "@/lib/i18n";
import { isResourceUnavailable } from "@/lib/resource-errors";
import { routeChrome } from "@/lib/route-title.ts";
import { getEnumKeyByValue, type ProfileAccount } from "@/lib/types.ts";
import { cn, hasInstancePermission } from "@/lib/utils.tsx";
import { isOneOf } from "@/lib/is-one-of";
import { formatFixed } from "@/lib/format.ts";
import { minecraftAvatarUrl } from "@/lib/minecraft-avatar.ts";
import { FoodBar, HeartsBar } from "@/components/minecraft/vitals.tsx";

export const Route = createFileRoute(
  "/_dashboard/instance/$instance/bot/$botId",
)({
  beforeLoad: () => ({
    ...routeChrome({
      getTitle: (match) =>
        typeof match.loaderData === "string" && match.loaderData.trim()
          ? match.loaderData
          : i18n.t("common:pageName.botDetail"),
      getIcon: () => ({
        kind: "dynamic",
        name: "users",
      }),
    }),
  }),
  loader: async (props) => {
    void props.context.queryClient.prefetchQuery(
      botInfoQueryOptions(props.params.instance, props.params.botId),
    );

    const instanceInfo = await props.context.queryClient.ensureQueryData(
      props.context.instanceInfoQueryOptions,
    );

    return (
      instanceInfo.profile.accounts.find(
        (account) => account.profileId === props.params.botId,
      )?.lastKnownName ?? null
    );
  },
  component: BotDetail,
});

function BotDetailSkeleton() {
  return (
    <div className="container flex flex-col gap-4 py-4">
      <BotDetailHeaderSkeleton />
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-8 w-full sm:w-120" />
        </div>
        <div className="p-4">
          <TabPanelSkeleton />
        </div>
      </div>
    </div>
  );
}

function BotDetail() {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { botId } = Route.useParams();
  const { error: botInfoError } = useQuery({
    ...botInfoQueryOptions(instanceInfo.id, botId),
    refetchInterval: false,
  });

  // Find the account
  const account = useMemo(
    () => instanceInfo.profile.accounts.find((a) => a.profileId === botId),
    [instanceInfo.profile.accounts, botId],
  );

  if (!account || isResourceUnavailable(botInfoError)) {
    return (
      <InstancePageLayout
        extraCrumbs={[
          { id: "controls", content: t("breadcrumbs.controls") },
          { id: "bots", content: t("breadcrumbs.bots") },
        ]}
        pageName={t("pageName.botDetail")}
      >
        <div className="container flex py-8">
          <Empty className="mx-auto max-w-md bg-card">
            <EmptyHeader>
              <EmptyTitle>{t("botUnavailable.title")}</EmptyTitle>
              <EmptyDescription>
                {t("botUnavailable.description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    to="/instance/$instance/bots"
                    params={{ instance: instanceInfo.id }}
                  />
                }
              >
                <ArrowLeftIcon data-icon="inline-start" />
                {t("bots.backToBots")}
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </InstancePageLayout>
    );
  }

  return (
    <InstancePageLayout
      extraCrumbs={[
        { id: "controls", content: t("breadcrumbs.controls") },
        { id: "bots", content: t("breadcrumbs.bots") },
      ]}
      pageName={account.lastKnownName}
      // The header card shows the name with the avatar and state, so the
      // layout keeps its h1 in the breadcrumb instead of repeating it.
      hidePageHeading
      loadingSkeleton={<BotDetailSkeleton />}
    >
      <BotDetailContent account={account} instanceId={instanceInfo.id} />
    </InstancePageLayout>
  );
}

const BOT_TABS = ["overview", "inventory", "controls", "terminal"] as const;
type BotTab = (typeof BOT_TABS)[number];

function getGameModeLabel(
  gameMode: GameMode,
  t: (key: string) => string,
): string {
  switch (gameMode) {
    case GameMode.SURVIVAL: {
      return t("bots.statsPanel.survival");
    }
    case GameMode.CREATIVE: {
      return t("bots.statsPanel.creative");
    }
    case GameMode.ADVENTURE: {
      return t("bots.statsPanel.adventure");
    }
    case GameMode.SPECTATOR: {
      return t("bots.statsPanel.spectator");
    }
    case GameMode.UNSPECIFIED:
    default: {
      return t("bots.statsPanel.unknown");
    }
  }
}

function BotDetailContent({
  account,
  instanceId,
}: {
  account: ProfileAccount;
  instanceId: string;
}) {
  const { t } = useTranslation("instance");
  const { t: tCommon } = useTranslation("common");
  const typeKey = getEnumKeyByValue(
    MinecraftAccountProto_AccountTypeProto,
    account.type,
  );
  const TypeIcon = accountTypeToIcon(typeKey);
  const [activeTab, setActiveTab] = useState<BotTab>("overview");
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<null>();
  const copyToClipboard = useCopyToClipboard();
  const logScope = useMemo<LogScope>(
    () =>
      create(LogScopeSchema, {
        scope: {
          case: "bot",
          value: create(BotLogScopeSchema, {
            instanceId,
            botId: account.profileId,
          }),
        },
      }),
    [instanceId, account.profileId],
  );
  const commandScope = useMemo<CommandScope>(
    () =>
      create(CommandScopeSchema, {
        scope: {
          case: "bot",
          value: create(BotCommandScopeSchema, {
            instanceId,
            botId: account.profileId,
          }),
        },
      }),
    [instanceId, account.profileId],
  );

  return (
    <div className="container flex flex-col gap-4 py-4">
      <Suspense fallback={<BotDetailHeaderSkeleton />}>
        <BotDetailHeader
          account={account}
          instanceId={instanceId}
          typeKey={typeKey}
          typeIcon={TypeIcon}
          onContextMenu={handleContextMenu}
        />
      </Suspense>

      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <DropdownMenuItem
            onClick={() => {
              void copyToClipboard(account.lastKnownName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUsername")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void copyToClipboard(account.profileId);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUuid")}
          </DropdownMenuItem>
        </ContextMenuPortal>
      )}

      <Suspense fallback={null}>
        <BotStateNotice
          instanceId={instanceId}
          botId={account.profileId}
          onOpenControls={() => {
            setActiveTab("controls");
          }}
        />
      </Suspense>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <ToggleGroup
            value={[activeTab]}
            onValueChange={(value) => {
              const nextTab = value[0];
              if (isOneOf(nextTab, BOT_TABS)) {
                setActiveTab(nextTab);
              }
            }}
            aria-label={t("bots.tabs.label")}
            variant="outline"
            size="sm"
            spacing={1}
            className="grid w-full grid-cols-2 sm:flex sm:w-fit"
          >
            <ToggleGroupItem value="overview">
              <EyeIcon data-icon="inline-start" />
              {t("bots.tabs.overview")}
            </ToggleGroupItem>
            <ToggleGroupItem value="inventory">
              <BackpackIcon data-icon="inline-start" />
              {t("bots.tabs.inventory")}
            </ToggleGroupItem>
            <ToggleGroupItem value="controls">
              <Gamepad2Icon data-icon="inline-start" />
              {t("bots.tabs.controls")}
            </ToggleGroupItem>
            <ToggleGroupItem value="terminal">
              <SquareTerminalIcon data-icon="inline-start" />
              {t("bots.tabs.terminal")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="p-4">
          <Activity mode={activeTab === "overview" ? "visible" : "hidden"}>
            <Suspense fallback={<TabPanelSkeleton />}>
              <OverviewTab
                instanceId={instanceId}
                botId={account.profileId}
                botName={account.lastKnownName}
              />
            </Suspense>
          </Activity>
          <Activity mode={activeTab === "inventory" ? "visible" : "hidden"}>
            <Suspense fallback={<TabPanelSkeleton />}>
              <BotInventoryPanel
                instanceId={instanceId}
                botId={account.profileId}
              />
            </Suspense>
          </Activity>
          <Activity mode={activeTab === "controls" ? "visible" : "hidden"}>
            <Suspense fallback={<TabPanelSkeleton />}>
              <BotControlsTab
                instanceId={instanceId}
                botId={account.profileId}
              />
            </Suspense>
          </Activity>
          <Activity mode={activeTab === "terminal" ? "visible" : "hidden"}>
            <Suspense fallback={<TabPanelSkeleton className="gap-2" />}>
              <BotTerminalPanel
                logScope={logScope}
                commandScope={commandScope}
              />
            </Suspense>
          </Activity>
        </div>
      </div>
    </div>
  );
}

function TabPanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}

function BotDetailHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
      <Skeleton className="h-16 w-12 rounded-sm" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="ml-auto h-9 w-28 rounded-md" />
    </div>
  );
}

function BotDetailHeader({
  account,
  instanceId,
  typeKey,
  typeIcon: TypeIcon,
  onContextMenu,
}: {
  account: ProfileAccount;
  instanceId: string;
  typeKey: keyof typeof MinecraftAccountProto_AccountTypeProto;
  typeIcon: ReturnType<typeof accountTypeToIcon>;
  onContextMenu: (event: React.MouseEvent, data: null) => void;
}) {
  const { i18n: activeI18n, t } = useTranslation("instance");
  const { data: botInfo } = useSuspenseQuery(
    botInfoQueryOptions(instanceId, account.profileId),
  );
  const liveState = botInfo.liveState;
  const isOnline = liveState !== undefined;
  const typeLabel = translateAccountType(activeI18n, typeKey);

  return (
    <Item
      variant="outline"
      className="rounded-lg p-4"
      onContextMenu={(event) => {
        onContextMenu(event, null);
      }}
    >
      <ItemMedia>
        <img
          src={minecraftAvatarUrl("body", liveState?.skinTextureHash)}
          alt={account.lastKnownName}
          className="h-16 w-auto"
          loading="lazy"
        />
      </ItemMedia>
      <ItemContent className="gap-1">
        <ItemTitle className="text-lg">{account.lastKnownName}</ItemTitle>
        <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-2 text-sm">
          <BotStateBadge
            bot={{
              isOnline,
              connectionPhase: isOnline
                ? BotConnectionPhase.SPAWNED
                : BotConnectionPhase.DISCONNECTED,
              status: botInfo.status,
            }}
          />
          <span className="flex items-center gap-1">
            <TypeIcon className="size-3" />
            {typeLabel}
          </span>
          {liveState && <span>{getGameModeLabel(liveState.gameMode, t)}</span>}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap">
        <BotPowerActions
          instanceId={instanceId}
          botId={account.profileId}
          state={getBotDisplayState({
            isOnline,
            status: botInfo.status,
          })}
        />
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/instance/$instance/bots"
              params={{ instance: instanceId }}
            />
          }
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("bots.backToBots")}
        </Button>
      </ItemActions>
      {/* Vitals get their own row so the name and actions stay readable on phones. */}
      {liveState && (
        <div className="flex basis-full flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
          <HeartsBar
            health={liveState.health}
            maxHealth={liveState.maxHealth}
          />
          <FoodBar foodLevel={liveState.foodLevel} />
          <div
            className="flex items-center gap-2"
            title={t("bots.statsPanel.experience")}
          >
            <SparklesIcon className="size-4 text-success" />
            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full w-(--xp-progress) bg-success transition-all"
                style={{
                  "--xp-progress": `${liveState.experienceProgress * 100}%`,
                }}
              />
            </div>
            <span className="text-xs tabular-nums">
              <span className="sr-only">
                {t("bots.statsPanel.experience")}{" "}
              </span>
              {t("bots.statsPanel.levelShort", {
                level: liveState.experienceLevel,
              })}
            </span>
          </div>
        </div>
      )}
    </Item>
  );
}

/** Start, restart, and stop change what this bot should do, not its view. */
function BotPowerActions({
  instanceId,
  botId,
  state,
}: {
  instanceId: string;
  botId: string;
  state: BotDisplayState;
}) {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions, queryClient } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const transport = use(TransportContext);
  const change = useMutation({
    mutationKey: ["bots", "single-state", instanceId, botId],
    scope: { id: `bot-state-${instanceId}` },
    mutationFn: async (action: "start" | "restart" | "stop") => {
      if (transport === null) throw new Error(t("demoReadOnly"));
      const client = createRpcClient(BotService, transport);
      if (action === "restart") {
        await Effect.runPromise(
          client.restartBots({ instanceId, botIds: [botId] }),
        );
        return;
      }
      await Effect.runPromise(
        client.setBotsDesiredState({
          instanceId,
          botIds: [botId],
          desiredState:
            action === "start"
              ? BotDesiredState.RUNNING
              : BotDesiredState.STOPPED,
        }),
      );
    },
    onError: (error, action) => {
      toastError(t(`controls.${action}Toast.error`), error);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bot-status", instanceId] }),
        queryClient.invalidateQueries({
          queryKey: botInfoQueryOptions(instanceId, botId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: ["instance-info", instanceId],
        }),
      ]),
  });
  if (!hasInstancePermission(instanceInfo, InstancePermission.CONTROL_BOTS)) {
    return null;
  }
  const run = (action: "start" | "restart" | "stop") => {
    if (transport === null) {
      toast.info(t("demoReadOnly"));
      return;
    }
    change.mutate(action);
  };
  if (state === "stopped") {
    return (
      <Button
        size="sm"
        disabled={change.isPending}
        onClick={() => {
          run("start");
        }}
      >
        <PlayIcon data-icon="inline-start" />
        {t("controls.start")}
      </Button>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant={state === "failed" ? "default" : "outline"}
        disabled={change.isPending || state === "stopping"}
        onClick={() => {
          run("restart");
        }}
      >
        <RefreshCwIcon data-icon="inline-start" />
        {t("controls.restart")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={change.isPending || state === "stopping"}
        onClick={() => {
          run("stop");
        }}
      >
        <SquareIcon data-icon="inline-start" />
        {t("controls.stop")}
      </Button>
    </>
  );
}

/** Says what a disconnected bot is doing and points to the next step. */
function BotStateNotice({
  instanceId,
  botId,
  onOpenControls,
}: {
  instanceId: string;
  botId: string;
  onOpenControls: () => void;
}) {
  const { t } = useTranslation("instance");
  const { data: botInfo } = useSuspenseQuery(
    botInfoQueryOptions(instanceId, botId),
  );
  const isOnline = !!botInfo.liveState;
  const state = getBotDisplayState({ isOnline, status: botInfo.status });
  const { data: dialogData } = useQuery({
    ...botDialogQueryOptions(instanceId, botId),
    enabled: isOnline,
    refetchInterval: isOnline ? 2000 : false,
  });
  if (isOnline && dialogData?.dialog) {
    return (
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Alert renders a div, and the status role announces this update
      <Alert role="status">
        <MonitorIcon />
        <AlertTitle>{t("bots.notice.dialogOpen.title")}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap items-center gap-2">
            {t("bots.notice.dialogOpen.description")}
            <Button size="sm" variant="outline" onClick={onOpenControls}>
              {t("bots.notice.dialogOpen.action")}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "connected" || state === "stopping") return null;
  const lastError = botInfo.status?.lastError;
  if (state === "failed" || state === "retrying") {
    const kind = lastError ? classifyBotFailure(lastError) : "other";
    const fix = getFailureFix(kind, instanceId);
    return (
      <Alert role="alert">
        <CircleAlertIcon
          className={
            state === "failed" ? "text-destructive" : "text-warning-emphasis"
          }
        />
        <AlertTitle>{t(`bots.notice.${state}`)}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-2">
            <span>{t(`fleet.kind.${kind}.description`)}</span>
            {lastError && (
              <span className="font-mono text-xs wrap-break-word select-text">
                {lastError}
              </span>
            )}
            {fix && (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                nativeButton={false}
                render={<Link {...fix.link} />}
              >
                {t(fix.labelKey)}
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <output className="block text-sm text-muted-foreground">
      {t(`bots.notice.${state}`)}
    </output>
  );
}

function OverviewTab({
  instanceId,
  botId,
  botName,
}: {
  instanceId: string;
  botId: string;
  botName: string;
}) {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: botInfo } = useSuspenseQuery(
    botInfoQueryOptions(instanceId, botId),
  );
  const { t } = useTranslation("instance");
  const { t: tCommon } = useTranslation("common");
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<null>();
  const copyToClipboard = useCopyToClipboard();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const canWatchFeed = hasInstancePermission(
    instanceInfo,
    InstancePermission.READ_BOT_INFO,
  );
  const isOnline = !!botInfo.liveState;
  const liveState = botInfo.liveState;
  const connectionStep = getPovConnectionStep(botInfo);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        {/* Main: watch and control, with this bot's chat below. */}
        <div className="flex min-w-0 flex-col gap-6">
          <BotPovPlayer
            instanceId={instanceId}
            botId={botId}
            isOnline={isOnline}
            offlineStatus={{
              message: t(`bots.pov.step.${connectionStep}`),
              waiting: POV_WAITING_STEPS.has(connectionStep),
              detail:
                connectionStep === "failed" || connectionStep === "retrying"
                  ? botInfo.status?.lastError
                  : undefined,
            }}
          />
          <BotChatBox
            key={`${instanceId}:${botId}`}
            instanceId={instanceId}
            botId={botId}
            disabledReason={
              isOnline ? undefined : t("bots.chatPanel.offlineHint")
            }
          />
          {/* A new bot starts a new feed instead of showing the last one's. */}
          <LiveFeed
            key={`feed:${instanceId}:${botId}`}
            instanceId={instanceId}
            canWatch={canWatchFeed}
            botName={botName}
            title={t("bots.chatPanel.title")}
          />
        </div>

        {/* Side: status first, details on request. */}
        <div
          className="flex min-w-0 flex-col gap-6"
          onContextMenu={(e) => {
            handleContextMenu(e, null);
          }}
        >
          <Item variant="outline" size="sm">
            <ItemMedia>
              <NetworkIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("bots.connectionPanel.proxy")}</ItemTitle>
              <ItemDescription className="break-all select-text">
                {botInfo.connection ? (
                  botInfo.connection.proxy ? (
                    <span className="inline-flex items-center gap-2">
                      {getEnumKeyByValue(
                        ProxyProto_Type,
                        botInfo.connection.proxy.type,
                      )}
                      <span aria-hidden="true">·</span>
                      <ProxyAddress
                        address={botInfo.connection.proxy.address}
                      />
                    </span>
                  ) : (
                    t("bots.connectionPanel.direct")
                  )
                ) : (
                  t("bots.connectionPanel.unavailable")
                )}
              </ItemDescription>
            </ItemContent>
          </Item>

          <BotPanel icon={CompassIcon} title={t("bots.positionPanel.title")}>
            {liveState ? (
              <dl className="grid grid-cols-3 gap-x-2 gap-y-1 font-mono text-sm select-text">
                {(
                  [
                    ["x", liveState.x, 2],
                    ["y", liveState.y, 2],
                    ["z", liveState.z, 2],
                    ["yaw", liveState.yRot, 1],
                    ["pitch", liveState.xRot, 1],
                  ] as const
                ).map(([key, value, digits]) => (
                  <div key={key} className="flex gap-1">
                    <dt className="text-muted-foreground">
                      {t(`bots.positionPanel.${key}`)}:
                    </dt>
                    <dd>
                      {formatFixed(value, digits)}
                      {digits === 1 && "°"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <BotPanelEmpty>{t("bots.positionPanel.offline")}</BotPanelEmpty>
            )}
          </BotPanel>

          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="group/details w-fit"
                />
              }
            >
              <ChevronRightIcon
                data-icon="inline-start"
                className="group-data-panel-open/details:rotate-90"
              />
              {t("bots.detailsToggle")}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 flex flex-col gap-4">
              <dl className="text-sm">
                <dt className="text-xs text-muted-foreground">
                  {t("bots.profileId")}
                </dt>
                <dd className="font-mono text-xs break-all select-text">
                  {botId}
                </dd>
              </dl>
              <BotVisualPanel liveState={liveState} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Context menu for position copy */}
      {contextMenu && liveState && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <DropdownMenuItem
            onClick={() => {
              void copyToClipboard(
                `${liveState.x.toFixed(2)}, ${liveState.y.toFixed(2)}, ${liveState.z.toFixed(2)}`,
              );
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyCoordinates")}
          </DropdownMenuItem>
        </ContextMenuPortal>
      )}
    </>
  );
}

function BotTerminalPanel({
  logScope,
  commandScope,
}: {
  logScope: LogScope;
  commandScope: CommandScope;
}) {
  const { t } = useTranslation("common");
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  // The server refuses the bot log stream without this permission.
  if (
    !hasInstancePermission(
      instanceInfo,
      InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
    )
  ) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("terminal.botLogsNoPermission.title")}</EmptyTitle>
          <EmptyDescription>
            {t("terminal.botLogsNoPermission.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <TerminalComponent scope={logScope}>
      {hasInstancePermission(
        instanceInfo,
        InstancePermission.INSTANCE_COMMAND_EXECUTION,
      ) && <CommandInput scope={commandScope} />}
    </TerminalComponent>
  );
}

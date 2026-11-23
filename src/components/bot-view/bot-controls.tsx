import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Effect } from "effect";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  GamepadIcon,
  LoaderIcon,
  type LucideIcon,
  MonitorIcon,
  MousePointerClickIcon,
  SquareIcon,
} from "lucide-react";
import { use } from "react";
import { useTranslation } from "react-i18next";
import { BotDialogForm } from "@/components/bot-dialog-form";
import { BotPanel, BotPanelEmpty } from "@/components/bot-view/bot-panel.tsx";
import {
  botDialogQueryOptions,
  botInfoQueryOptions,
  createBotClient,
  toastError,
} from "@/components/bot-view/bot-queries.ts";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Toggle } from "@/components/ui/toggle.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  type BotLiveState,
  type BotMouseClickRequest,
  BotMouseClickRequestSchema,
  DialogType,
  MouseButton,
} from "@/generated/soulfire/bot_pb";
import { useMutationScopePending } from "@/hooks/use-mutation-scope-pending";
import { dialogMutationOptions } from "@/lib/dialog-mutation-options";
import {
  copyMinecraftText,
  openMinecraftUrl,
} from "@/lib/minecraft-client-actions";
import { applyServerDialogRefresh } from "@/lib/server-dialog-query";

/** Movement, mouse actions, and the server dialog for one bot. */
export function BotControlsTab({
  instanceId,
  botId,
}: {
  instanceId: string;
  botId: string;
}) {
  const { data: botInfo } = useSuspenseQuery(
    botInfoQueryOptions(instanceId, botId),
  );
  const liveState = botInfo.liveState;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <BotMovementPanel
        instanceId={instanceId}
        botId={botId}
        liveState={liveState}
        movementState={botInfo.movementState}
      />
      <div className="flex flex-col gap-6">
        <BotActionsPanel
          isOnline={liveState !== undefined}
          instanceId={instanceId}
          botId={botId}
        />
        <BotDialogPanel
          isOnline={liveState !== undefined}
          instanceId={instanceId}
          botId={botId}
        />
      </div>
    </div>
  );
}

function BotActionsPanel({
  isOnline,
  instanceId,
  botId,
}: {
  isOnline: boolean;
  instanceId: string;
  botId: string;
}) {
  const { t } = useTranslation("instance");
  const demo = use(TransportContext) === null;

  const mutationKey = ["bot", "mouse", "click", instanceId, botId];
  // Each click is a separate, short server action. The shared scope queues
  // fast repeated clicks in order instead of dropping them.
  const pendingButtons = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the click mutation always receives a BotMouseClickRequest
      (mutation.state.variables as BotMouseClickRequest | undefined)?.button,
  });

  const { mutate: mutateClick } = useMutation({
    mutationKey,
    scope: { id: `bot-mouse-${instanceId}-${botId}` },
    mutationFn: async (request: BotMouseClickRequest) => {
      const client = createBotClient();
      const response = await Effect.runPromise(client.mouseClick(request));
      if (!response.success) throw new Error(response.error ?? "");
    },
    onError: (error) => {
      toastError(t("bots.actionsPanel.clickError"), error, {
        id: `bot-mouse-error-${instanceId}-${botId}`,
      });
    },
  });

  const clickButton = (button: MouseButton) => {
    mutateClick(
      create(BotMouseClickRequestSchema, { instanceId, botId, button }),
    );
  };

  return (
    <BotPanel icon={MousePointerClickIcon} title={t("bots.actionsPanel.title")}>
      {isOnline ? (
        <div className="flex flex-col gap-2">
          {demo && (
            <p className="text-xs text-muted-foreground">
              {t("bots.demoControls")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {MOUSE_ACTIONS.map(({ button, key }) => {
              const pending = pendingButtons.includes(button);
              return (
                <Button
                  key={key}
                  variant="outline"
                  onClick={() => {
                    clickButton(button);
                  }}
                  disabled={demo}
                  aria-busy={pending}
                  title={t(`bots.actionsPanel.${key}Description`)}
                >
                  {pending && (
                    <LoaderIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  )}
                  {t(`bots.actionsPanel.${key}`)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <BotPanelEmpty>{t("bots.actionsPanel.offline")}</BotPanelEmpty>
      )}
    </BotPanel>
  );
}

const MOUSE_ACTIONS = [
  { button: MouseButton.LEFT_BUTTON, key: "leftClick" },
  { button: MouseButton.RIGHT_BUTTON, key: "rightClick" },
] as const;

const EMPTY_MOVEMENT_STATE = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sneak: false,
  sprint: false,
};

type MovementState = typeof EMPTY_MOVEMENT_STATE;

const MOVEMENT_MODIFIERS = ["jump", "sneak", "sprint"] as const;

function BotMovementPanel({
  instanceId,
  botId,
  liveState,
  movementState: currentMovementState,
}: {
  instanceId: string;
  botId: string;
  liveState?: BotLiveState | undefined;
  movementState?: MovementState | undefined;
}) {
  const { t } = useTranslation("instance");
  const demo = use(TransportContext) === null;
  const queryClient = useQueryClient();
  const movementState = currentMovementState ?? EMPTY_MOVEMENT_STATE;
  const mutationScopeId = `bot-movement-${instanceId}-${botId}`;
  const isPending = useMutationScopePending(mutationScopeId);
  const refreshBotInfo = () =>
    queryClient.invalidateQueries({
      queryKey: botInfoQueryOptions(instanceId, botId).queryKey,
    });

  const { mutate: mutateMovement } = useMutation({
    mutationKey: ["bot", "movement", "state", instanceId, botId],
    scope: { id: mutationScopeId },
    mutationFn: async (state: Partial<MovementState>) => {
      const client = createBotClient();
      return Effect.runPromise(
        client.setMovementState({ instanceId, botId, ...state }),
      );
    },
    onError: (error) => {
      toastError(t("bots.movementPanel.movementError"), error);
    },
    onSuccess: refreshBotInfo,
  });

  const resetMutation = useMutation({
    mutationKey: ["bot", "movement", "reset", instanceId, botId],
    scope: { id: mutationScopeId },
    mutationFn: async () => {
      const client = createBotClient();
      return Effect.runPromise(client.resetMovement({ instanceId, botId }));
    },
    onError: (error) => {
      toastError(t("bots.movementPanel.movementError"), error);
    },
    onSuccess: refreshBotInfo,
  });

  const { mutate: mutateRotation } = useMutation({
    mutationKey: ["bot", "rotation", instanceId, botId],
    scope: { id: mutationScopeId },
    mutationFn: async (rotation: { yaw: number; pitch: number }) => {
      const client = createBotClient();
      return Effect.runPromise(
        client.setRotation({ instanceId, botId, ...rotation }),
      );
    },
    onError: (error) => {
      toastError(t("bots.movementPanel.rotationError"), error);
    },
    onSuccess: refreshBotInfo,
  });

  if (!liveState) {
    return (
      <BotPanel icon={GamepadIcon} title={t("bots.movementPanel.title")}>
        <BotPanelEmpty>{t("bots.movementPanel.offline")}</BotPanelEmpty>
      </BotPanel>
    );
  }

  const movementDisabled = isPending || !currentMovementState;
  const toggleMovement = (key: keyof MovementState) => {
    mutateMovement({ [key]: !movementState[key] });
  };
  const rotate = (deltaYaw: number, deltaPitch: number) => {
    mutateRotation({
      yaw: liveState.yRot + deltaYaw,
      pitch: Math.max(-90, Math.min(90, liveState.xRot + deltaPitch)),
    });
  };
  const movementToggle = (
    key: "forward" | "backward" | "left" | "right",
    Icon: LucideIcon,
  ) => (
    <Toggle
      pressed={movementState[key]}
      variant="outline"
      size="sm"
      className="size-10"
      onPressedChange={() => {
        toggleMovement(key);
      }}
      disabled={movementDisabled}
      aria-label={t(`bots.movementPanel.${key}`)}
      title={t(`bots.movementPanel.${key}`)}
    >
      <Icon />
    </Toggle>
  );
  const rotationButton = (
    key: "lookUp" | "lookDown" | "lookLeft" | "lookRight",
    Icon: LucideIcon,
    deltaYaw: number,
    deltaPitch: number,
  ) => (
    <Button
      variant="outline"
      size="sm"
      className="size-10"
      onClick={() => {
        rotate(deltaYaw, deltaPitch);
      }}
      disabled={isPending || demo}
      aria-label={t(`bots.movementPanel.${key}`)}
      title={t(`bots.movementPanel.${key}`)}
    >
      <Icon />
    </Button>
  );

  return (
    <BotPanel icon={GamepadIcon} title={t("bots.movementPanel.title")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("bots.movementPanel.movement")}
          </p>
          {(demo || !currentMovementState) && (
            <p className="text-xs text-muted-foreground">
              {demo
                ? t("bots.demoControls")
                : t("bots.movementPanel.updateServer")}
            </p>
          )}
          <div className="flex flex-col items-center gap-1">
            {movementToggle("forward", ArrowUpIcon)}
            <div className="flex gap-1">
              {movementToggle("left", ArrowLeftIcon)}
              {movementToggle("backward", ArrowDownIcon)}
              {movementToggle("right", ArrowRightIcon)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            multiple
            aria-label={t("bots.movementPanel.modifiers")}
            value={MOVEMENT_MODIFIERS.filter((key) => movementState[key])}
            onValueChange={(value) => {
              for (const key of MOVEMENT_MODIFIERS) {
                if (value.includes(key) !== movementState[key]) {
                  toggleMovement(key);
                }
              }
            }}
            variant="outline"
            size="sm"
            spacing={2}
            className="flex-wrap"
          >
            {MOVEMENT_MODIFIERS.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                disabled={movementDisabled}
              >
                {t(`bots.movementPanel.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              resetMutation.mutate();
            }}
            disabled={isPending || demo}
          >
            <SquareIcon data-icon="inline-start" />
            {t("bots.movementPanel.stop")}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("bots.movementPanel.rotation")}
          </p>
          <div className="flex flex-col items-center gap-1">
            {rotationButton("lookUp", ChevronUpIcon, 0, -15)}
            <div className="flex gap-1">
              {rotationButton("lookLeft", ChevronLeftIcon, -15, 0)}
              {rotationButton("lookDown", ChevronDownIcon, 0, 15)}
              {rotationButton("lookRight", ChevronRightIcon, 15, 0)}
            </div>
          </div>
        </div>
      </div>
    </BotPanel>
  );
}

function dialogTypeKey(type: DialogType) {
  switch (type) {
    case DialogType.NOTICE: {
      return "notice";
    }
    case DialogType.CONFIRMATION: {
      return "confirmation";
    }
    case DialogType.MULTI_ACTION: {
      return "multiAction";
    }
    case DialogType.SERVER_LINKS: {
      return "serverLinks";
    }
    case DialogType.DIALOG_LIST: {
      return "dialogList";
    }
    case DialogType.UNSPECIFIED:
    default: {
      return "unknownType";
    }
  }
}

function BotDialogPanel({
  isOnline,
  instanceId,
  botId,
}: {
  isOnline: boolean;
  instanceId: string;
  botId: string;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const dialogQueryOptions = botDialogQueryOptions(instanceId, botId);
  const { data: dialogData } = useSuspenseQuery({
    ...dialogQueryOptions,
    refetchInterval: isOnline ? 2000 : false,
  });
  const dialog = isOnline ? dialogData.dialog : undefined;

  const mutationOptions = dialogMutationOptions(
    instanceId,
    botId,
    dialog?.screenId,
  );
  const isPending = useMutationScopePending(mutationOptions.scope.id);

  const submitMutation = useMutation({
    ...mutationOptions,
    mutationFn: async ({
      buttonIndex,
      inputValues,
      expectedScreenId,
    }: {
      buttonIndex: number;
      inputValues: Record<string, string>;
      expectedScreenId: string;
    }) => {
      const service = createBotClient();
      const result = await Effect.runPromise(
        service.submitDialog({
          instanceId,
          botId,
          buttonIndex,
          inputValues,
          expectedScreenId,
        }),
      );
      if (!result.success)
        // The toast title already says the action failed, so only the
        // server's reason goes in the description.
        throw new Error(result.error ?? "");
      if (result.clipboard !== undefined)
        void copyMinecraftText(result.clipboard);
      if (result.openUrl !== undefined) openMinecraftUrl(result.openUrl);
      // A failed refresh must not turn an accepted action into a retryable failure.
      return Effect.runPromise(service.getDialog({ instanceId, botId })).catch(
        () => undefined,
      );
    },
    onSuccess: (state, { expectedScreenId }) =>
      applyServerDialogRefresh(
        queryClient,
        dialogQueryOptions.queryKey,
        expectedScreenId,
        state,
      ),
    onError: (error) => {
      toastError(t("bots.dialogPanel.submitError"), error);
      if (error instanceof ConnectError && error.code === Code.Aborted)
        void queryClient.invalidateQueries({
          queryKey: dialogQueryOptions.queryKey,
        });
    },
  });

  return (
    <BotPanel
      icon={MonitorIcon}
      title={t("bots.dialogPanel.title")}
      actions={
        dialog && (
          <Badge variant="outline">
            {t(`bots.dialogPanel.${dialogTypeKey(dialog.type)}`)}
          </Badge>
        )
      }
    >
      {!isOnline ? (
        <BotPanelEmpty>{t("bots.dialogPanel.offline")}</BotPanelEmpty>
      ) : dialog ? (
        <div className="flex flex-col gap-4">
          {dialog.id && (
            <dl className="flex items-center justify-between gap-2 text-sm">
              <dt className="text-muted-foreground">
                {t("bots.dialogPanel.dialogId")}
              </dt>
              <dd>
                <code className="rounded-sm bg-muted px-2 py-1 text-xs break-all select-text">
                  {dialog.id}
                </code>
              </dd>
            </dl>
          )}
          <BotDialogForm
            key={`${instanceId}:${botId}:${dialog.screenId}`}
            dialog={dialog}
            pending={isPending}
            onSubmit={async (buttonIndex, inputValues) => {
              const state = await submitMutation.mutateAsync({
                buttonIndex,
                inputValues,
                expectedScreenId: dialog.screenId,
              });
              return state?.dialog;
            }}
          />
        </div>
      ) : (
        <BotPanelEmpty>{t("bots.dialogPanel.noDialog")}</BotPanelEmpty>
      )}
    </BotPanel>
  );
}

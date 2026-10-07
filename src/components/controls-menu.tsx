import { createClient } from "@connectrpc/connect";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  EllipsisIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { use, useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import GenerateAccountsDialog from "@/components/dialog/generate-accounts-dialog.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  BotDesiredState,
  BotService,
  type BotStatus,
} from "@/generated/soulfire/bot_pb";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import { isPostHogConfigured } from "@/lib/posthog.ts";
import type { GenerateAccountsMode, ProfileAccount } from "@/lib/types.ts";
import { applyGeneratedAccounts, hasInstancePermission } from "@/lib/utils.tsx";

function shuffle<T>(values: T[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const selectedIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[selectedIndex]] = [
      values[selectedIndex] as T,
      values[index] as T,
    ];
  }
}

export default function ControlsMenu() {
  const { t } = useTranslation("common");
  const posthog = usePostHog();
  const { instanceInfoQueryOptions, metricsQueryOptions } = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => ({
      instanceInfoQueryOptions: context.instanceInfoQueryOptions,
      metricsQueryOptions: context.metricsQueryOptions,
    }),
  });
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const statusQueryOptions = botStatusQueryOptions(instanceInfo.id);
  const { data: botList } = useSuspenseQuery(statusQueryOptions);
  const [startCount, setStartCount] = useState("1");
  const [startOpen, setStartOpen] = useState(false);
  const startCountId = useId();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [pendingStartCount, setPendingStartCount] = useState<number | null>(
    null,
  );

  const canControl = hasInstancePermission(
    instanceInfo,
    InstancePermission.CONTROL_BOTS,
  );
  const existingUsernames = useMemo(
    () =>
      new Set(
        instanceInfo.profile.accounts.map((account) => account.lastKnownName),
      ),
    [instanceInfo.profile.accounts],
  );
  const stoppedCount = botList.bots.filter(
    (bot) => bot.status?.desiredState !== BotDesiredState.RUNNING,
  ).length;
  const desiredBotIds = botList.bots
    .filter((bot) => bot.status?.desiredState === BotDesiredState.RUNNING)
    .map((bot) => bot.profileId);

  const invalidateBotQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: statusQueryOptions.queryKey }),
      queryClient.invalidateQueries({
        queryKey: instanceInfoQueryOptions.queryKey,
      }),
      queryClient.invalidateQueries({ queryKey: metricsQueryOptions.queryKey }),
      queryClient.invalidateQueries({ queryKey: ["instance-list"] }),
    ]);
  }, [
    instanceInfoQueryOptions.queryKey,
    metricsQueryOptions.queryKey,
    queryClient,
    statusQueryOptions.queryKey,
  ]);

  const setDesiredState = useCallback(
    async (
      botIds: string[],
      desiredState: BotDesiredState,
    ): Promise<BotStatus[]> => {
      if (transport === null || botIds.length === 0) {
        return [];
      }
      const response = await createClient(
        BotService,
        transport,
      ).setBotsDesiredState({
        instanceId: instanceInfo.id,
        botIds,
        desiredState,
      });
      return response.bots;
    },
    [instanceInfo.id, transport],
  );

  const startBots = useCallback(
    async (count?: number) => {
      if (transport === null) return [];
      const latest = await createClient(BotService, transport).getBotList({
        instanceId: instanceInfo.id,
      });
      const candidates = latest.bots.filter(
        (bot) => bot.status?.desiredState !== BotDesiredState.RUNNING,
      );
      if (
        instanceInfo.profile.settings.account?.["shuffle-accounts"] === true
      ) {
        shuffle(candidates);
      }
      const selected =
        count === undefined
          ? candidates
          : candidates.slice(0, Math.max(0, Math.floor(count)));
      return setDesiredState(
        selected.map((bot) => bot.profileId),
        BotDesiredState.RUNNING,
      );
    },
    [
      instanceInfo.id,
      instanceInfo.profile.settings.account,
      setDesiredState,
      transport,
    ],
  );

  const startMutation = useMutation({
    mutationKey: ["bots", "start", instanceInfo.id],
    scope: { id: `bot-state-${instanceInfo.id}` },
    mutationFn: async (count?: number) => {
      if (instanceInfo.profile.accounts.length === 0) {
        setPendingStartCount(count ?? Number.MAX_SAFE_INTEGER);
        setGenerateDialogOpen(true);
        return [];
      }
      const promise = startBots(count);
      toast.promise(promise, {
        loading: t("controls.startToast.loading"),
        success: t("controls.startToast.success"),
        error: t("controls.startToast.error"),
      });
      return promise;
    },
    onSuccess: (bots) => {
      if (isPostHogConfigured && bots.length > 0) {
        posthog.capture("bot_start_completed", { bot_count: bots.length });
      }
    },
    onSettled: invalidateBotQueries,
  });

  const restartMutation = useMutation({
    mutationKey: ["bots", "restart", instanceInfo.id],
    scope: { id: `bot-state-${instanceInfo.id}` },
    mutationFn: async () => {
      if (transport === null || desiredBotIds.length === 0) return [];
      const promise = createClient(BotService, transport)
        .restartBots({ instanceId: instanceInfo.id, botIds: desiredBotIds })
        .then((response) => response.bots);
      toast.promise(promise, {
        loading: t("controls.restartToast.loading"),
        success: t("controls.restartToast.success"),
        error: t("controls.restartToast.error"),
      });
      return promise;
    },
    onSuccess: (bots) => {
      if (isPostHogConfigured && bots.length > 0) {
        posthog.capture("bot_restart_completed", { bot_count: bots.length });
      }
    },
    onSettled: invalidateBotQueries,
  });

  const stopMutation = useMutation({
    mutationKey: ["bots", "stop", instanceInfo.id],
    scope: { id: `bot-state-${instanceInfo.id}` },
    mutationFn: async () => {
      const promise = setDesiredState(desiredBotIds, BotDesiredState.STOPPED);
      toast.promise(promise, {
        loading: t("controls.stopToast.loading"),
        success: t("controls.stopToast.success"),
        error: t("controls.stopToast.error"),
      });
      return promise;
    },
    onSuccess: (bots) => {
      if (isPostHogConfigured && bots.length > 0) {
        posthog.capture("bot_stop_completed", { bot_count: bots.length });
      }
    },
    onSettled: invalidateBotQueries,
  });

  const applyGeneratedAccountsMutation = useMutation({
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
        instanceInfo.profile.accounts,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
      );
      if (pendingStartCount !== null) {
        await startBots(
          pendingStartCount === Number.MAX_SAFE_INTEGER
            ? undefined
            : pendingStartCount,
        );
      }
    },
    onSettled: async () => {
      setPendingStartCount(null);
      await invalidateBotQueries();
    },
  });

  if (!canControl) {
    const supportsBotControls = instanceInfo.instancePermissions.some(
      (permission) =>
        permission.instancePermission === InstancePermission.CONTROL_BOTS,
    );
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t(
          supportsBotControls
            ? "controls.permissionDenied"
            : "controls.serverUpdateRequired",
        )}
      </p>
    );
  }

  const isPending =
    startMutation.isPending ||
    restartMutation.isPending ||
    stopMutation.isPending;
  const requestedStartCount = Number(startCount);
  const hasAccounts = instanceInfo.profile.accounts.length > 0;
  const startUnavailable = hasAccounts && stoppedCount === 0;
  const validStartCount =
    startCount.trim() !== "" &&
    Number.isInteger(requestedStartCount) &&
    requestedStartCount >= 1 &&
    (!hasAccounts || requestedStartCount <= stoppedCount);

  const showCountError =
    !startUnavailable && startCount !== "" && !validStartCount;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger
            render={
              <Button size="sm" disabled={isPending || startUnavailable} />
            }
          >
            <PlayIcon data-icon="inline-start" />
            {t("controls.startBots")}
            <ChevronDownIcon data-icon="inline-end" />
          </PopoverTrigger>
          <PopoverContent align="end">
            <PopoverHeader>
              <PopoverTitle>{t("controls.startBots")}</PopoverTitle>
              <PopoverDescription>
                {t(
                  hasAccounts
                    ? "controls.availableCount"
                    : "controls.generateFirst",
                  { count: stoppedCount },
                )}
              </PopoverDescription>
            </PopoverHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!validStartCount || isPending || startUnavailable) return;
                startMutation.mutate(requestedStartCount);
                setStartOpen(false);
              }}
            >
              <FieldGroup>
                <Field data-invalid={showCountError}>
                  <FieldLabel htmlFor={startCountId}>
                    {t("controls.startCount")}
                  </FieldLabel>
                  <Input
                    id={startCountId}
                    type="number"
                    min={1}
                    max={hasAccounts ? stoppedCount : undefined}
                    step={1}
                    required
                    aria-invalid={showCountError}
                    value={startCount}
                    onChange={(event) => setStartCount(event.target.value)}
                    disabled={isPending || startUnavailable}
                  />
                  <FieldDescription>
                    {t("controls.startCountHelp")}
                  </FieldDescription>
                  {showCountError && (
                    <FieldError>
                      {t(
                        hasAccounts
                          ? "controls.validCount"
                          : "controls.positiveCount",
                        { count: stoppedCount },
                      )}
                    </FieldError>
                  )}
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isPending || startUnavailable || !validStartCount}
                  >
                    <PlayIcon data-icon="inline-start" />
                    {validStartCount
                      ? t("controls.startSelected", {
                          count: requestedStartCount,
                        })
                      : t("controls.startBots")}
                  </Button>
                  {hasAccounts && requestedStartCount !== stoppedCount && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending || startUnavailable}
                      onClick={() => {
                        startMutation.mutate(undefined);
                        setStartOpen(false);
                      }}
                    >
                      {t("controls.startAllCount", { count: stoppedCount })}
                    </Button>
                  )}
                </div>
              </FieldGroup>
            </form>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="sm"
          onClick={() => stopMutation.mutate()}
          disabled={isPending || desiredBotIds.length === 0}
        >
          <SquareIcon data-icon="inline-start" />
          {t("controls.stopCount", { count: desiredBotIds.length })}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("controls.moreActions")}
                disabled={isPending || desiredBotIds.length === 0}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => restartMutation.mutate()}
                disabled={isPending || desiredBotIds.length === 0}
              >
                <RefreshCwIcon />
                {t("controls.restartCount", { count: desiredBotIds.length })}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <GenerateAccountsDialog
        open={generateDialogOpen}
        onOpenChange={(open) => {
          setGenerateDialogOpen(open);
          if (!open) setPendingStartCount(null);
        }}
        onGenerate={(newAccounts, mode) =>
          applyGeneratedAccountsMutation.mutateAsync({ newAccounts, mode })
        }
        existingUsernames={existingUsernames}
      />
    </>
  );
}

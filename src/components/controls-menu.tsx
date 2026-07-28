import { createClient } from "@connectrpc/connect";
import {
  BotDesiredState,
  BotService,
  type BotStatus,
} from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import { InstancePermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { PlayIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { use, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import GenerateAccountsDialog from "@/components/dialog/generate-accounts-dialog.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
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
  const [startCount, setStartCount] = useState(1);
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
    return null;
  }

  const isPending =
    startMutation.isPending ||
    restartMutation.isPending ||
    stopMutation.isPending;
  const normalizedStartCount = Math.max(
    1,
    Math.min(stoppedCount || 1, Math.floor(startCount) || 1),
  );
  const startUnavailable =
    instanceInfo.profile.accounts.length > 0 && stoppedCount === 0;

  return (
    <>
      <ButtonGroup className="flex-wrap">
        <InputGroup className="w-36">
          <InputGroupInput
            type="number"
            min={1}
            max={Math.max(1, stoppedCount)}
            value={startCount}
            aria-label={t("controls.startCount")}
            onChange={(event) => setStartCount(event.target.valueAsNumber)}
            disabled={isPending || stoppedCount === 0}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              variant="secondary"
              onClick={() => startMutation.mutate(normalizedStartCount)}
              disabled={isPending || startUnavailable}
            >
              <PlayIcon />
              {t("controls.start")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <Button
          variant="secondary"
          onClick={() => startMutation.mutate(undefined)}
          disabled={isPending || startUnavailable}
        >
          <PlayIcon />
          {t("controls.startAll")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => restartMutation.mutate()}
          disabled={isPending || desiredBotIds.length === 0}
        >
          <RefreshCwIcon />
          {t("controls.restart")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => stopMutation.mutate()}
          disabled={isPending || desiredBotIds.length === 0}
        >
          <SquareIcon />
          {t("controls.stopAll")}
        </Button>
      </ButtonGroup>

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

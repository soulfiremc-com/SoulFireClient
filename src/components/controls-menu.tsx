import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { use, useCallback, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import GenerateAccountsDialog from "@/components/dialog/generate-accounts-dialog.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
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
import { useMutationScopePending } from "@/hooks/use-mutation-scope-pending";
import { parseBotStartCount, selectBotsToStart } from "@/lib/bot-fleet.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import { isPostHogConfigured } from "@/lib/posthog.ts";
import type { GenerateAccountsMode, ProfileAccount } from "@/lib/types.ts";
import {
  applyGeneratedAccounts,
  getSettingValue,
  hasInstancePermission,
} from "@/lib/utils.tsx";
import { displayText } from "@/lib/display-text";

export default function ControlsMenu() {
  const { t } = useTranslation("common");
  const { t: tInstance } = useTranslation("instance");
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
  const startCountRef = useRef<HTMLInputElement>(null);
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
      const response = await Effect.runPromise(
        createRpcClient(BotService, transport).setBotsDesiredState({
          instanceId: instanceInfo.id,
          botIds,
          desiredState,
        }),
      );
      return response.bots;
    },
    [instanceInfo.id, transport],
  );

  const startBots = useCallback(
    async (count?: number) => {
      if (transport === null) return [];
      const latest = await Effect.runPromise(
        createRpcClient(BotService, transport).getBotList({
          instanceId: instanceInfo.id,
        }),
      );
      return setDesiredState(
        selectBotsToStart(
          latest.bots,
          count,
          instanceInfo.profile.settings.account?.["shuffle-accounts"] === true,
        ),
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
        posthog.capture("bot_start_completed", {
          bot_count: bots.length,
          source: "controls",
        });
      }
    },
    onSettled: invalidateBotQueries,
  });

  const restartMutation = useMutation({
    mutationKey: ["bots", "restart", instanceInfo.id],
    scope: { id: `bot-state-${instanceInfo.id}` },
    mutationFn: async () => {
      if (transport === null || desiredBotIds.length === 0) return [];
      const promise = Effect.runPromise(
        createRpcClient(BotService, transport).restartBots({
          instanceId: instanceInfo.id,
          botIds: desiredBotIds,
        }),
      ).then((response) => response.bots);
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
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
      );
      if (pendingStartCount !== null) {
        const bots = await startBots(
          pendingStartCount === Number.MAX_SAFE_INTEGER
            ? undefined
            : pendingStartCount,
        );
        if (isPostHogConfigured && bots.length > 0) {
          posthog.capture("bot_start_completed", {
            bot_count: bots.length,
            source: "controls",
          });
        }
      }
    },
    onSettled: async () => {
      setPendingStartCount(null);
      await invalidateBotQueries();
    },
  });

  const isPending = useMutationScopePending(`bot-state-${instanceInfo.id}`);

  if (!canControl) {
    const supportsBotControls = instanceInfo.instancePermissions.some(
      (permission) =>
        permission.instancePermission === InstancePermission.CONTROL_BOTS,
    );
    return (
      <output className="block text-sm text-muted-foreground">
        {t(
          supportsBotControls
            ? "controls.permissionDenied"
            : "controls.serverUpdateRequired",
        )}
      </output>
    );
  }

  const hasAccounts = instanceInfo.profile.accounts.length > 0;
  const startUnavailable = hasAccounts && stoppedCount === 0;
  const requestedStartCount = parseBotStartCount(
    startCount,
    hasAccounts ? stoppedCount : undefined,
  );
  const validStartCount = requestedStartCount !== null;

  const showCountError =
    !startUnavailable && startCount !== "" && !validStartCount;

  // Show where bots go before they start. Failed first starts often come
  // from a server address that was never changed from the default.
  const definitions = instanceInfo.settingsDefinitions;
  const addressDefinition = definitions.find(
    (d) => d.id?.namespace === "bot" && d.id.key === "address",
  );
  const versionDefinition = definitions.find(
    (d) => d.id?.namespace === "bot" && d.id.key === "protocol-version",
  );
  const address = displayText(
    getSettingValue(instanceInfo.profile, addressDefinition) ?? "",
  );
  const usesDefaultAddress =
    addressDefinition?.type.case === "string" &&
    address === addressDefinition.type.value.def;
  const version = displayText(
    getSettingValue(instanceInfo.profile, versionDefinition) ?? "",
  );
  const versionName =
    versionDefinition?.type.case === "combo"
      ? (versionDefinition.type.value.options.find((o) => o.id === version)
          ?.displayName ?? version)
      : version;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          {/* Stays clickable when every bot runs, so the popover can say why
              nothing can start instead of showing a silent disabled button. */}
          <PopoverTrigger
            render={<Button size="sm" disabled={startMutation.isPending} />}
          >
            {startMutation.isPending ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            {t("controls.startBots")}
            <ChevronDownIcon data-icon="inline-end" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            initialFocus={startUnavailable ? undefined : startCountRef}
          >
            <PopoverHeader>
              <PopoverTitle>{t("controls.startBots")}</PopoverTitle>
              <PopoverDescription>
                {t(
                  !hasAccounts
                    ? "controls.generateFirst"
                    : startUnavailable
                      ? "controls.allRunning"
                      : "controls.availableCount",
                  { count: stoppedCount },
                )}
              </PopoverDescription>
            </PopoverHeader>
            {address !== "" && !startUnavailable && (
              <div className="flex flex-col gap-2 text-sm">
                <p>
                  {t("controls.target", { address, version: versionName })}{" "}
                  <Link
                    className="underline underline-offset-3"
                    to="/instance/$instance/settings/$pageId"
                    params={{ instance: instanceInfo.id, pageId: "bot" }}
                    onClick={() => setStartOpen(false)}
                  >
                    {t("controls.changeTarget")}
                  </Link>
                </p>
                {usesDefaultAddress && (
                  <Alert>
                    <CircleAlertIcon />
                    <AlertDescription>
                      {tInstance("setup.start.defaultAddress", { address })}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  requestedStartCount === null ||
                  isPending ||
                  startUnavailable
                ) {
                  return;
                }
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
                    ref={startCountRef}
                    onFocus={(event) => event.currentTarget.select()}
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
                    {requestedStartCount !== null
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
          {stopMutation.isPending ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="motion-safe:animate-spin"
            />
          ) : (
            <SquareIcon data-icon="inline-start" />
          )}
          {t("controls.stopCount", { count: desiredBotIds.length })}
        </Button>
        {/* Restart was the only entry in a "more" menu, which hid it behind
            an icon. A labeled button shows what it does and how many bots. */}
        {desiredBotIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => restartMutation.mutate()}
            disabled={isPending}
          >
            {restartMutation.isPending ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t("controls.restartCount", { count: desiredBotIds.length })}
          </Button>
        )}
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
